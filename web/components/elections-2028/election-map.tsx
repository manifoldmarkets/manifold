import { SearchIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { sortBy, uniq } from 'lodash'
import {
  CSSProperties,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'

import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { Contract } from 'common/contract'
import {
  Atlas,
  CALLOUTS,
  calloutY,
  districtShapes,
  hexLayout,
  hexShapes,
  HIT_RADIUS_PX,
  LABEL_AT,
  loadAtlas,
  Shape,
  stateShapes,
  tileShapes,
  TINY_STATES,
  UNLABELLED,
} from 'web/components/usa-map/atlas-shapes'
import {
  formatOdds,
  labelInk,
  LIGHT_LABEL,
  plural,
} from 'web/components/usa-map/election-display'
import styles from 'web/components/usa-map/election-explorer.module.css'
import { FilterResults } from 'web/components/usa-map/filter-results'
import { Point } from 'web/components/usa-map/map-camera'
import {
  firstShape,
  isDirection,
  nextShape,
  placeHexLabels,
  unionBounds,
} from 'web/components/usa-map/map-geometry'
import {
  MapView as MapStyle,
  MapViewToggle,
} from 'web/components/usa-map/map-view-toggle'
import { RaceDetailsPanel } from 'web/components/usa-map/race-details-panel'
import { getPartyProbs } from 'web/components/usa-map/state-election-map'
import { useMapCamera } from 'web/components/usa-map/use-map-camera'
import { useLiveContract } from 'web/hooks/use-contract'
import { ELECTORAL_UNITS } from 'web/lib/politics/ec-model'
import {
  availableModes,
  describeFill,
  Fill,
  MapMode,
  MapView,
  mapFills,
  MAP_VIEW_EVENT,
  mapTracker,
  matchesPlace,
  PlacedMarket,
  placeTitle,
  statePanel,
  tippingPlaces,
} from 'web/lib/politics/election-map'
import type { ElectoralModel } from 'web/lib/politics/elections-2028'
import { TERRITORIES } from 'web/lib/politics/official-markets'
import { PrimaryRow } from 'web/lib/politics/primaries'
import { BoardRace } from 'web/lib/politics/race-board'
import { track } from 'web/lib/service/analytics'
import own from './election-map.module.css'
import { fillColor, HoverFacts, PinnedPlace } from './map-place-card'
import { MapTracker, segmentColor } from './map-tracker'

// The 2028 map, on the 2026 explorer's parts: the atlas's states and House
// districts (or the tile and hex cartograms), its zoom, and its card, which
// follows the pointer on hover and pins on a click. President (Maine and
// Nebraska by district, with a statewide badge), Senate, Governor, House
// and the primaries. Above the map, a tracker counts every electoral vote
// or seat by how sure our markets are; the President view outlines the
// likeliest tipping points. A clicked place lists every market the page has
// for its state, each tradable in place.

const MODES: { mode: MapMode; label: string }[] = [
  { mode: 'president', label: 'President' },
  { mode: 'senate', label: 'Senate' },
  { mode: 'governor', label: 'Governor' },
  { mode: 'house', label: 'House' },
  { mode: 'primary', label: 'Primaries' },
]

// Maine and Nebraska give each congressional district an electoral vote;
// the President map draws their districts, and a badge for the two
// statewide votes.
const SPLIT_STATES = ['ME', 'NE']
const BADGE = { width: 30, height: 18 }
const EV_BY_KEY = Object.fromEntries(ELECTORAL_UNITS.map((u) => [u.key, u.ev]))

const badgeShape = (state: Shape): Shape => {
  const x = state.center.x - BADGE.width / 2
  const y = state.center.y - BADGE.height / 2
  return {
    id: state.id,
    rect: { x, y, ...BADGE, rx: 4 },
    bounds: { x0: x, y0: y, x1: x + BADGE.width, y1: y + BADGE.height },
    center: state.center,
  }
}

// Maine's and Nebraska's districts as small tiles along the bottom of their
// state's tile.
function districtTiles(atlas: Atlas, tiles: Shape[]): Shape[] {
  return SPLIT_STATES.flatMap((st) => {
    const rect = tiles.find((t) => t.id === st)?.rect
    if (!rect) return []
    const districts = sortBy(
      atlas.districts.filter((d) => d.state === st).map((d) => d.district)
    )
    const pad = 5
    const gap = 3
    const h = 16
    const w =
      (rect.width - pad * 2 - gap * (districts.length - 1)) / districts.length
    const y = rect.y + rect.height - pad - h
    return districts.map((d, i) => {
      const x = rect.x + pad + i * (w + gap)
      return {
        id: `${st}-${d}`,
        rect: { x, y, width: w, height: h, rx: 3 },
        bounds: { x0: x, y0: y, x1: x + w, y1: y + h },
        center: { x: x + w / 2, y: y + h / 2 },
      }
    })
  })
}

function mapShapes(atlas: Atlas, style: MapStyle, mode: MapMode): Shape[] {
  if (mode === 'house')
    return style === 'map' ? districtShapes(atlas) : hexShapes(atlas)
  if (style === 'cartogram') {
    const tiles = tileShapes(atlas)
    return mode === 'president'
      ? [...tiles, ...districtTiles(atlas, tiles)]
      : tiles
  }
  const states = stateShapes(atlas)
  if (mode !== 'president') return states
  return [
    ...states.filter((s) => !SPLIT_STATES.includes(s.id)),
    ...districtShapes(atlas).filter((s) =>
      SPLIT_STATES.includes(s.id.split('-')[0])
    ),
    ...states.filter((s) => SPLIT_STATES.includes(s.id)).map(badgeShape),
  ]
}

function Outline(props: { shape: Shape; className: string }) {
  const { shape, className } = props
  return shape.rect ? (
    <rect {...shape.rect} className={className} />
  ) : (
    <path d={shape.d} className={className} />
  )
}

const DEFAULT_VIEW: MapView = { mode: 'president', office: 'P', party: 'D' }

// "Lean D", "Lean D and Toss-up", "Safe D, Likely D and Lean D".
const joinLabels = (labels: string[]) =>
  labels.length === 0
    ? undefined
    : labels.length === 1
    ? labels[0]
    : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`

export function ElectionMap(props: {
  races: BoardRace[]
  primaries: PrimaryRow[]
  offYear: Contract[]
  defaultMode: MapMode
  model?: ElectoralModel | null
  partyContract?: Contract | null
}) {
  const { races, primaries, model } = props
  const modes = useMemo(
    () => availableModes(races, primaries),
    [races, primaries]
  )
  const [saved, setSaved] = usePersistentInMemoryState<MapView | undefined>(
    undefined,
    'election-map-view-2'
  )
  const start = modes.includes(props.defaultMode) ? props.defaultMode : modes[0]
  const view: MapView = useMemo(() => {
    const v = saved ?? { ...DEFAULT_VIEW, mode: start ?? 'president' }
    return modes.includes(v.mode) ? v : { ...v, mode: start ?? 'president' }
  }, [saved, modes, start])
  const mode = view.mode
  const [style, setStyle] = usePersistentInMemoryState<MapStyle>(
    'map',
    'election-map-style'
  )
  const [selected, setSelected] = useState<string>()
  const [hovered, setHovered] = useState<string>()
  const [roving, setRoving] = useState<string>()
  const [focused, setFocused] = useState<string>()
  const [groups, setGroups] = useState<string[]>([])
  const [preview, setPreview] = useState<string>()
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const mapPointer = useRef<Point>()
  const selectionOrigin = useRef<HTMLElement | SVGElement | null>(null)
  const explorerRef = useRef<HTMLElement>(null)
  const headerRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [atlas, setAtlas] = useState<Atlas>()
  const [mapError, setMapError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const {
    svgRef,
    camera,
    dragged,
    pixelsPerUnit,
    viewBox,
    resetView,
    zoom: zoomMap,
    fit,
  } = useMapCamera(!!atlas)
  const uid = useId().replace(/:/g, '')
  const keyHintId = `map-keys-${uid}`

  const president = mode === 'president'
  const fills = useMemo(
    () => mapFills(view, races, primaries),
    [view, races, primaries]
  )
  const tracker = useMemo(
    () => mapTracker(view, races, primaries),
    [view, races, primaries]
  )
  const tips = useMemo(
    () => (model ? tippingPlaces(model.tippingPoints) : []),
    [model]
  )
  const tipChance = useMemo(
    () =>
      Object.fromEntries((model?.tippingPoints ?? []).map((t) => [t.key, t.p])),
    [model]
  )
  const more = useMemo<PlacedMarket[]>(
    () =>
      props.offYear.map((c) => ({
        question: c.question,
        slug: c.slug,
        creatorUsername: c.creatorUsername,
      })),
    [props.offYear]
  )
  const shapes = useMemo(
    () => (atlas ? mapShapes(atlas, style, mode) : []),
    [atlas, style, mode]
  )
  const shapeById = useMemo(
    () => new Map(shapes.map((s) => [s.id, s])),
    [shapes]
  )
  // Places the map can't draw: territories and Democrats Abroad in the
  // primaries, DC in the tile grid (and as a chip where it gets no label).
  const chips = useMemo(
    () =>
      sortBy(
        Object.keys(fills).filter(
          (k) =>
            !shapeById.has(k) || (k === 'DC' && !(president && style === 'map'))
        ),
        (k) => (k in TERRITORIES ? 1 : 0),
        (k) => k
      ),
    [fills, shapeById, president, style]
  )
  const groupPlaces = useMemo(
    () =>
      new Set(
        tracker.segments
          .filter((s) => groups.includes(s.key))
          .flatMap((s) => s.places)
      ),
    [tracker, groups]
  )
  const previewPlaces = useMemo(() => {
    if (!preview) return new Set<string>()
    if (preview.startsWith('tip:')) return new Set([preview.slice(4)])
    return new Set(
      tracker.segments.find((s) => s.key === preview)?.places ?? []
    )
  }, [tracker, preview])
  const searching = query.trim().length > 0
  const searchHits = useMemo(
    () =>
      searching
        ? uniq([...shapes.map((s) => s.id), ...chips]).filter((id) =>
            matchesPlace(id, query)
          )
        : [],
    [searching, shapes, chips, query]
  )
  const narrowed = groups.length > 0 || searching
  const lit = (id: string) =>
    (groups.length === 0 || groupPlaces.has(id)) &&
    (!searching || searchHits.includes(id))
  const listed = useMemo(() => {
    const ids =
      groups.length > 0
        ? tracker.segments
            .filter((s) => groups.includes(s.key))
            .flatMap((s) => s.places)
        : searchHits
    return searching ? ids.filter((id) => searchHits.includes(id)) : ids
  }, [groups, tracker, searchHits, searching])
  // The list's heading: the groups picked on the bar ("Lean D", "Lean D
  // and Toss-up"), else the count a search found.
  const groupTitle = useMemo(
    () =>
      joinLabels(
        tracker.segments
          .filter((s) => groups.includes(s.key))
          .map((s) => s.label)
      ),
    [tracker, groups]
  )

  const isSelectable = (id: string) =>
    !!fills[id] || (mode !== 'house' && mode !== 'primary' && shapeById.has(id))
  const navigable = shapes.filter((s) => isSelectable(s.id) && lit(s.id))
  const tabStop =
    roving && navigable.some((s) => s.id === roving)
      ? roving
      : selected && navigable.some((s) => s.id === selected)
      ? selected
      : firstShape(navigable)

  useEffect(() => {
    let live = true
    setMapError(false)
    loadAtlas()
      .then((a) => live && setAtlas(a))
      .catch(() => live && setMapError(true))
    return () => {
      live = false
    }
  }, [attempt])
  useEffect(() => {
    if (searchOpen) searchRef.current?.focus()
  }, [searchOpen])
  // Another section can switch the view (the primaries section's link).
  useEffect(() => {
    const listen = (e: Event) => {
      const patch = (e as CustomEvent<Partial<MapView>>).detail
      if (patch?.mode && modes.includes(patch.mode)) update(patch)
    }
    window.addEventListener(MAP_VIEW_EVENT, listen)
    return () => window.removeEventListener(MAP_VIEW_EVENT, listen)
  })
  useEffect(() => {
    if (selected) return
    const clear = () => setHovered(undefined)
    window.addEventListener('scroll', clear, true)
    return () => window.removeEventListener('scroll', clear, true)
  }, [selected])
  useEffect(() => {
    if (!selected) return
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) {
        setSelected(undefined)
        selectionOrigin.current?.focus({ preventScroll: true })
      }
    }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [selected])
  // A search frames what it finds.
  const hitKey = searchHits.join(',')
  useEffect(() => {
    if (!shapes.length) return
    if (!hitKey) {
      resetView()
      return
    }
    const bounds = unionBounds(
      hitKey.split(',').map((id) => shapeById.get(id)?.bounds)
    )
    if (bounds) fit(bounds, mode === 'house' ? 5 : 3)
  }, [hitKey, shapes])

  const update = (patch: Partial<MapView>) => {
    const next = { ...view, ...patch }
    track('election map view', next)
    setSaved(next)
    setSelected(undefined)
    setHovered(undefined)
    setGroups([])
    setPreview(undefined)
    setRoving(undefined)
    if (patch.mode && patch.mode !== mode) resetView()
  }
  const changeStyle = (next: MapStyle) => {
    if (next === style) return
    track('election map style', { style: next, mode })
    setStyle(next)
    setHovered(undefined)
    resetView()
  }
  const focusMap = () => {
    if (
      window.innerWidth <= 850 &&
      (explorerRef.current?.getBoundingClientRect().top ?? 0) > 8
    )
      explorerRef.current?.scrollIntoView({
        block: 'start',
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth',
      })
  }
  const choose = (id: string, element: HTMLElement | SVGElement | null) => {
    track('election map place', { place: id, mode })
    // Focus returns here on close: the control that opened the card, else
    // the place's own shape.
    selectionOrigin.current =
      element ??
      svgRef.current?.querySelector<SVGElement>(`[data-race-id="${id}"]`) ??
      null
    setSelected(id)
    setRoving(id)
    setSearchOpen(false)
    focusMap()
  }
  const closeDetails = () => {
    setSelected(undefined)
    selectionOrigin.current?.focus({ preventScroll: true })
  }
  const zoom = (factor: number) => {
    setHovered(undefined)
    zoomMap(factor)
    focusMap()
  }
  const moveFocus = (from: string, key: string) => {
    const origin = shapeById.get(from)?.center
    if (!origin || !isDirection(key)) return
    const next = nextShape(origin, navigable, key)
    if (!next) return
    setRoving(next)
    svgRef.current
      ?.querySelector<SVGElement>(`[data-race-id="${next}"]`)
      ?.focus({ preventScroll: true })
  }

  const isStatewide = (id: string) => president && SPLIT_STATES.includes(id)
  const titleOf = (id: string) => placeTitle(id, isStatewide(id))
  const ariaLabel = (id: string) => {
    const fill = fills[id]
    return `${titleOf(id)}: ${
      fill ? describeFill(fill) : `no ${mode === 'primary' ? 'market' : 'race'}`
    }`
  }
  const shapeProps = (id: string) => {
    const fill = fills[id]
    const selectable = isSelectable(id)
    const dimmed = narrowed && !lit(id) && !previewPlaces.has(id)
    const previewDimmed =
      !narrowed && previewPlaces.size > 0 && !previewPlaces.has(id)
    return {
      fill: fillColor(fill),
      className: clsx(styles.shape, !fill && styles.noRace),
      opacity: dimmed ? 0.15 : previewDimmed ? 0.35 : 1,
      role: selectable ? 'button' : undefined,
      tabIndex: selectable && id === tabStop ? 0 : -1,
      'aria-label': ariaLabel(id),
      'aria-describedby': selectable ? keyHintId : undefined,
      'aria-pressed': selectable ? selected === id : undefined,
      'data-race-id': selectable ? id : undefined,
      onClick: (e: React.MouseEvent<SVGElement>) => {
        if (selectable && !dragged.current) choose(id, e.currentTarget)
      },
      onFocus: (e: React.FocusEvent<SVGElement>) => {
        setRoving(id)
        if (e.currentTarget.matches(':focus-visible')) setFocused(id)
      },
      onBlur: () => setFocused(undefined),
      onKeyDown: (e: React.KeyboardEvent<SVGElement>) => {
        if (selectable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          choose(id, e.currentTarget)
        } else if (isDirection(e.key)) {
          e.preventDefault()
          moveFocus(id, e.key)
        }
      },
    }
  }
  const trackHover = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType !== 'mouse' || window.innerWidth <= 850) return
    mapPointer.current = { x: e.clientX, y: e.clientY }
    if (e.buttons) {
      if (dragged.current) setHovered(undefined)
      return
    }
    const id =
      (e.target as Element)
        .closest('[data-race-id]')
        ?.getAttribute('data-race-id') ?? undefined
    if (id !== hovered) setHovered(id)
  }
  // Callouts and touch targets pick small states; in the House they frame
  // the state's districts.
  const tapState = (state: string) => {
    if (mode === 'house') {
      const bounds = unionBounds(
        shapes.filter((s) => s.id.startsWith(`${state}-`)).map((s) => s.bounds)
      )
      if (bounds) fit(bounds, 5)
      return
    }
    choose(state, null)
  }
  const tinyStates = president ? [...TINY_STATES, 'DC'] : TINY_STATES
  const callouts = president ? [...CALLOUTS, 'DC'] : CALLOUTS
  const handleTap = (e: React.PointerEvent<SVGSVGElement>) => {
    if (dragged.current || (e.pointerType === 'mouse' && e.button !== 0)) return
    const target = (e.target as Element).closest('[data-tap]')
    if (!target) return
    const states = (target.getAttribute('data-tap') ?? '').split(' ')
    if (states.length === 1) return tapState(states[0])
    const under = document
      .elementsFromPoint(e.clientX, e.clientY)
      .find((el) => el.hasAttribute('data-race-id'))
      ?.getAttribute('data-race-id')
    if (under && states.includes(under)) return choose(under, null)
    const matrix = (
      target.closest('g') as SVGGraphicsElement | null
    )?.getScreenCTM()
    if (!matrix) return
    const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      matrix.inverse()
    )
    const nearest = states
      .map((state) => {
        const center = shapeById.get(state)?.center
        return {
          state,
          distance: center
            ? Math.hypot(center.x - point.x, center.y - point.y)
            : Infinity,
        }
      })
      .sort((a, b) => a.distance - b.distance)[0]
    const nearestPx = nearest.distance * pixelsPerUnit * camera.k
    if (under && nearestPx > 12) return choose(under, null)
    if (Number.isFinite(nearest.distance)) tapState(nearest.state)
  }

  const labelStyle = (id: string) => {
    const color = fillColor(fills[id])
    const ink = color ? labelInk(color) : undefined
    return ink
      ? ({
          '--label-ink': ink,
          '--label-halo': ink === LIGHT_LABEL ? '#1e293b80' : '#ffffffa0',
        } as CSSProperties)
      : undefined
  }
  const hexLabels = useMemo(() => {
    if (!atlas) return []
    const hex = atlas.hex
    const { s, tx, ty } = hexLayout(hex)
    const count = (state: string) =>
      hex.hexes.filter((h) => h.state === state).length
    const states = atlas.states
      .map((st) => st.state)
      .filter((state) => state !== 'DC')
      .sort((a, b) => count(b) - count(a))
    return placeHexLabels(states, hex.hexes, hex.size).map((l) => ({
      ...l,
      x: tx + l.x * s,
      y: ty + l.y * s,
    }))
  }, [atlas])
  const hitRadius = HIT_RADIUS_PX / (pixelsPerUnit * camera.k)
  const zoomedIn = camera.k >= 2
  const zoomControls = (className: string) => (
    <div
      className={clsx(styles.zoomControls, className)}
      role="group"
      aria-label="Map zoom controls"
    >
      <button
        aria-label="Zoom in"
        disabled={camera.k >= 6}
        onClick={() => zoom(1.5)}
      >
        +
      </button>
      <button
        aria-label="Zoom out"
        disabled={camera.k <= 1}
        onClick={() => zoom(1 / 1.5)}
      >
        −
      </button>
      <button
        aria-label="Reset map view"
        title="Reset view"
        onClick={resetView}
      >
        ↺
      </button>
    </div>
  )
  const overlay = (ids: Iterable<string | undefined>, className: string) =>
    [...ids].map((id) => {
      const shape = id ? shapeById.get(id) : undefined
      return shape ? (
        <Outline
          key={`${className}-${id}`}
          shape={shape}
          className={className}
        />
      ) : null
    })

  const detailId = selected ?? hovered
  const detailEyebrow = (id: string) => {
    if (mode === 'primary')
      return `${view.party === 'D' ? 'Democratic' : 'Republican'} ${
        view.office === 'P'
          ? 'presidential'
          : view.office === 'S'
          ? 'Senate'
          : 'governor'
      } primary`
    if (president) {
      const ev = EV_BY_KEY[id]
      return ev ? `President · ${plural(ev, 'electoral vote')}` : 'President'
    }
    return `${MODES.find((m) => m.mode === mode)?.label} · 2028`
  }
  const selectedSections = useMemo(
    () =>
      selected
        ? statePanel(selected.split('-')[0], races, primaries, more)
        : [],
    [selected, races, primaries, more]
  )

  if (modes.length === 0) return null

  return (
    <div className={clsx(styles.layout, own.layout)}>
      <section
        ref={explorerRef}
        className={styles.explorer}
        aria-label="2028 election map"
      >
        <header ref={headerRef} className={styles.header}>
          <MapTracker
            tracker={tracker}
            party={view.party}
            selection={groups}
            preview={preview?.startsWith('tip:') ? undefined : preview}
            onSelect={(next) => {
              track('election map tracker', { mode, groups: next })
              setGroups(next)
              setSelected(undefined)
            }}
            onPreview={setPreview}
          />
          <div className={styles.toolbar}>
            <ModeTabs
              modes={modes}
              mode={mode}
              onChange={(m) => update({ mode: m })}
            />
            <MapViewToggle
              view={style}
              measures={false}
              house={mode === 'house'}
              onChange={changeStyle}
            />
            <div className={styles.searchSlot}>
              <button
                className={clsx(
                  styles.searchToggle,
                  (searchOpen || query) && styles.activeTool
                )}
                aria-label="Find a state or district"
                aria-expanded={searchOpen}
                onClick={() => setSearchOpen(!searchOpen)}
              >
                <SearchIcon aria-hidden />
              </button>
              <label className={styles.search} data-open={searchOpen}>
                <SearchIcon aria-hidden />
                <input
                  ref={searchRef}
                  aria-label="Find a state or district"
                  placeholder={
                    mode === 'house' ? 'State or TX-15' : 'Find a state'
                  }
                  value={query}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setSearchOpen(false)
                    if (e.key === 'Enter' && searchHits.length === 1)
                      choose(searchHits[0], null)
                  }}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setSelected(undefined)
                  }}
                />
                {query && (
                  <button
                    aria-label="Clear search"
                    onClick={() => setQuery('')}
                  >
                    ×
                  </button>
                )}
              </label>
            </div>
            {zoomControls(styles.toolbarZoom)}
          </div>
        </header>

        {mode === 'primary' && <PrimaryControls view={view} update={update} />}
        {president && model && (
          <PresidentNotes
            model={model}
            partyContract={props.partyContract ?? null}
            tips={tips}
            onPreview={(key) => setPreview(key ? `tip:${key}` : undefined)}
            onPick={(key, element) => {
              track('election map tipping point', { place: key })
              choose(key, element)
            }}
          />
        )}
        {mode === 'senate' && (
          <p className={own.note}>
            Includes the 65 seats not up in 2028: 38 Democratic (with the
            independents who caucus with them) and 27 Republican.
          </p>
        )}

        <span className="sr-only" role="status">
          {narrowed
            ? `${groupTitle ? `${groupTitle}: ` : ''}${plural(
                listed.length,
                'place'
              )}`
            : ''}
        </span>
        {narrowed && (
          <FilterResults
            summary={
              <strong className={styles.filterCount}>
                {groupTitle ?? plural(listed.length, 'place')}
                {groupTitle && searching && (
                  <span className="text-ink-500 font-normal">
                    {' '}
                    · {plural(listed.length, 'match', 'matches')}
                  </span>
                )}
              </strong>
            }
            clearLabel={groups.length && searching ? 'Clear all' : 'Clear'}
            onClear={() => {
              setGroups([])
              setQuery('')
            }}
            label="Places in the selection"
            resetKey={`${mode}:${groups.join('+')}:${query}`}
            items={listed.map((id) => (
              <button key={id} onClick={(e) => choose(id, e.currentTarget)}>
                <span>{titleOf(id)}</span>
                <span className={styles.quote}>
                  {fills[id] ? describeFill(fills[id]) : '—'}
                </span>
              </button>
            ))}
            empty={<span>Nothing matches. Try a state name or TX-15.</span>}
          />
        )}

        <div className={styles.stage}>
          {!atlas ? (
            <div className={styles.mapLoading} role="status">
              {mapError ? (
                <>
                  The map couldn’t load.{' '}
                  <button onClick={() => setAttempt((a) => a + 1)}>
                    Try again
                  </button>
                </>
              ) : (
                'Loading the map…'
              )}
            </div>
          ) : (
            <svg
              ref={svgRef}
              viewBox={viewBox}
              aria-label={`${MODES.find((m) => m.mode === mode)?.label} ${
                style === 'map' ? 'map' : 'cartogram'
              }`}
              className={styles.map}
              data-mode={mode === 'house' ? 'house' : 'state'}
              data-view={style}
              data-zoomed={camera.k > 1}
              data-narrowed={narrowed}
              style={
                {
                  touchAction: camera.k > 1 ? 'none' : 'pan-y',
                  '--zoom': camera.k,
                } as CSSProperties
              }
              onWheel={() => setHovered(undefined)}
              onPointerEnter={trackHover}
              onPointerMove={trackHover}
              onPointerUp={handleTap}
              onPointerLeave={() => {
                mapPointer.current = undefined
                setHovered(undefined)
              }}
            >
              <g
                transform={`translate(${camera.x} ${camera.y}) scale(${camera.k})`}
              >
                {shapes.map((shape) => {
                  const shapeAttrs = shapeProps(shape.id)
                  return shape.rect ? (
                    <rect
                      key={shape.id}
                      {...shape.rect}
                      {...shapeAttrs}
                      className={clsx(
                        shapeAttrs.className,
                        isStatewide(shape.id) && style === 'map' && own.badge
                      )}
                    />
                  ) : (
                    <path key={shape.id} d={shape.d} {...shapeAttrs} />
                  )
                })}
                {style === 'map' &&
                  (mode === 'house' || president) &&
                  atlas.states
                    .filter(
                      (s) => mode === 'house' || SPLIT_STATES.includes(s.state)
                    )
                    .map((s) => (
                      <path
                        key={s.state}
                        d={s.path}
                        className={styles.stateOutline}
                      />
                    ))}
                <g className={styles.overlays} aria-hidden>
                  {president &&
                    overlay(
                      tips.map((t) => t.key),
                      own.tipOutline
                    )}
                  {overlay(narrowed ? listed : [], styles.matchOutline)}
                  {overlay(previewPlaces, styles.previewOutline)}
                  {overlay([selected], styles.selectedHalo)}
                  {overlay([selected], styles.selectedOutline)}
                  {overlay([focused], styles.focusHalo)}
                  {overlay([focused], styles.focusOutline)}
                </g>
                {style === 'map' && (
                  <g aria-hidden>
                    {atlas.states
                      .filter(
                        (s) =>
                          !(zoomedIn ? ['DC'] : UNLABELLED).includes(s.state) &&
                          !(president && SPLIT_STATES.includes(s.state))
                      )
                      .map((s) => {
                        const at = LABEL_AT[s.state] ?? {
                          x: s.center[0],
                          y: s.center[1],
                        }
                        // The President map gives each state that has room
                        // its electoral votes under its name.
                        const b = shapeById.get(s.state)?.bounds
                        const ev =
                          president &&
                          b &&
                          b.x1 - b.x0 >= 40 &&
                          b.y1 - b.y0 >= 28
                            ? EV_BY_KEY[s.state]
                            : undefined
                        return (
                          <text
                            key={s.state}
                            x={at.x}
                            y={ev ? at.y - 6 : at.y}
                            dy="0.35em"
                            className={styles.stateLabel}
                            style={
                              mode === 'house' ? undefined : labelStyle(s.state)
                            }
                          >
                            {s.state}
                            {ev && (
                              <tspan x={at.x} dy="1.2em" className={own.mapEv}>
                                {ev}
                              </tspan>
                            )}
                          </text>
                        )
                      })}
                    {president &&
                      SPLIT_STATES.map((st) => {
                        const badge = shapeById.get(st)
                        return badge ? (
                          <text
                            key={st}
                            x={badge.center.x}
                            y={badge.center.y}
                            dy="0.35em"
                            className={clsx(styles.stateLabel, own.badgeLabel)}
                            style={labelStyle(st)}
                          >
                            {st}
                          </text>
                        ) : null
                      })}
                    {!zoomedIn &&
                      callouts.map((state, i) => {
                        const s = atlas.states.find((s) => s.state === state)
                        if (!s) return null
                        return (
                          <g
                            key={state}
                            className={styles.callout}
                            data-tap={state}
                          >
                            <path
                              d={`M${s.center[0]} ${s.center[1]}L916 ${
                                calloutY(i) - 4
                              }`}
                              className={styles.labelLine}
                            />
                            <rect
                              x="914"
                              y={calloutY(i) - 20}
                              width="46"
                              height="29"
                              className={styles.calloutTarget}
                            />
                            {mode !== 'house' && fills[state] && (
                              <rect
                                x="916"
                                y={calloutY(i) - 14}
                                width="9"
                                height="9"
                                rx="2"
                                fill={fillColor(fills[state])}
                                className={own.calloutSwatch}
                              />
                            )}
                            <text
                              x={mode !== 'house' && fills[state] ? 929 : 930}
                              y={calloutY(i)}
                              className={styles.calloutLabel}
                            >
                              {state}
                            </text>
                          </g>
                        )
                      })}
                  </g>
                )}
                {style === 'map' && mode !== 'house' && (
                  <g className={styles.hitAreas} aria-hidden>
                    {tinyStates.map((state) => {
                      const center = shapeById.get(state)?.center
                      return center ? (
                        <circle
                          key={state}
                          cx={center.x}
                          cy={center.y}
                          r={hitRadius}
                          data-tap={tinyStates.join(' ')}
                        />
                      ) : null
                    })}
                  </g>
                )}
                {style === 'cartogram' && mode === 'house' && (
                  <g aria-hidden>
                    {hexLabels.map((l) => (
                      <text
                        key={l.state}
                        x={l.x}
                        y={l.y}
                        textAnchor={l.anchor}
                        className={styles.hexLabel}
                      >
                        {l.state}
                      </text>
                    ))}
                  </g>
                )}
                {style === 'cartogram' && mode !== 'house' && (
                  <g aria-hidden>
                    {shapes
                      .filter((s) => !s.id.includes('-'))
                      .map((shape) => {
                        const split =
                          president && SPLIT_STATES.includes(shape.id)
                        const ev = president ? EV_BY_KEY[shape.id] : undefined
                        return (
                          <text
                            key={shape.id}
                            x={shape.center.x}
                            y={shape.center.y - (split ? 12 : ev ? 6 : 0)}
                            dy="0.35em"
                            className={styles.tileLabel}
                            style={labelStyle(shape.id)}
                          >
                            {shape.id}
                            {ev && !split && (
                              <tspan
                                x={shape.center.x}
                                dy="1.25em"
                                className={own.tileEv}
                              >
                                {ev}
                              </tspan>
                            )}
                          </text>
                        )
                      })}
                  </g>
                )}
              </g>
            </svg>
          )}
          <span id={keyHintId} className="sr-only">
            Arrow keys move between places. Enter opens their markets.
          </span>
          {atlas && zoomControls(styles.stageZoom)}
        </div>

        {chips.length > 0 && (
          <div className={own.chips}>
            {chips.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={selected === k}
                onClick={(e) => choose(k, e.currentTarget)}
                onPointerEnter={(e) => {
                  // Only a chip whose place is also drawn (DC) has an
                  // outline to show; the rest would dim the whole map.
                  if (e.pointerType === 'mouse' && shapeById.has(k))
                    setPreview(`tip:${k}`)
                }}
                onPointerLeave={() => setPreview(undefined)}
              >
                <i
                  style={{ backgroundColor: fillColor(fills[k]) }}
                  aria-hidden
                />
                <span>{k in TERRITORIES ? TERRITORIES[k] : titleOf(k)}</span>
                <span className={own.chipValue}>{describeFill(fills[k])}</span>
              </button>
            ))}
          </div>
        )}

        <MapLegend
          view={view}
          tracker={tracker}
          tipping={president && tips.length > 0}
          fills={fills}
        />
        <p className={styles.hint}>
          {style === 'cartogram'
            ? mode === 'house'
              ? 'Every House district at equal size. '
              : 'Every state at equal size. '
            : ''}
          Hover for the odds; click{' '}
          {mode === 'house' ? 'a district' : 'a state'} for its markets and to
          bet. Scroll or pinch to zoom; drag to move.
        </p>

        {detailId && (
          <RaceDetailsPanel
            title={titleOf(detailId)}
            eyebrow={detailEyebrow(detailId)}
            label={`${titleOf(detailId)} markets`}
            closeRef={closeRef}
            pinned={!!selected}
            pointer={mapPointer}
            onClose={closeDetails}
            dockKey={`${selected}:${mode}:${style}:${shapes.length > 0}`}
            anchor={() =>
              selected
                ? svgRef.current
                    ?.querySelector(`[data-race-id="${selected}"]`)
                    ?.getBoundingClientRect()
                : undefined
            }
            topInset={() =>
              headerRef.current?.getBoundingClientRect().bottom ?? 0
            }
          >
            {selected ? (
              <PinnedPlace
                place={selected}
                view={view}
                sections={selectedSections}
                primaries={primaries}
                tipping={president ? tipChance[selected] : undefined}
              />
            ) : (
              <HoverFacts
                place={detailId}
                view={view}
                fill={fills[detailId]}
                races={races}
                tipping={president ? tipChance[detailId] : undefined}
              />
            )}
          </RaceDetailsPanel>
        )}
      </section>
    </div>
  )
}

function ModeTabs(props: {
  modes: MapMode[]
  mode: MapMode
  onChange: (mode: MapMode) => void
}) {
  const { modes, mode, onChange } = props
  const shown = MODES.filter((m) => modes.includes(m.mode))
  return (
    <>
      <label className={styles.mobileMode}>
        <select
          aria-label="Map"
          value={mode}
          onChange={(e) => onChange(e.target.value as MapMode)}
          className={own.modeSelect}
        >
          {shown.map((m) => (
            <option key={m.mode} value={m.mode}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <div className={styles.tabs} role="tablist" aria-label="Map">
        {shown.map((m, index) => (
          <button
            key={m.mode}
            role="tab"
            aria-selected={mode === m.mode}
            tabIndex={mode === m.mode ? 0 : -1}
            className={own.tab}
            onClick={() => onChange(m.mode)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
              e.preventDefault()
              const next =
                (index + (e.key === 'ArrowRight' ? 1 : shown.length - 1)) %
                shown.length
              onChange(shown[next].mode)
              e.currentTarget
                .closest('[role="tablist"]')
                ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                [next]?.focus()
            }}
          >
            <span className={styles.steadyLabel} data-text={m.label}>
              {m.label}
            </span>
          </button>
        ))}
      </div>
    </>
  )
}

function Segmented<T extends string>(props: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  const { label, value, options, onChange } = props
  return (
    <div className={styles.viewToggle} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          <span className={styles.steadyLabel} data-text={o.label}>
            {o.label}
          </span>
        </button>
      ))}
    </div>
  )
}

function PrimaryControls(props: {
  view: MapView
  update: (patch: Partial<MapView>) => void
}) {
  const { view, update } = props
  return (
    <div className={own.subControls}>
      <Segmented
        label="Primaries for"
        value={view.office}
        options={[
          { value: 'P', label: 'President' },
          { value: 'S', label: 'Senate' },
          { value: 'G', label: 'Governor' },
        ]}
        onChange={(office) => update({ office })}
      />
      <Segmented
        label="Party"
        value={view.party}
        options={[
          { value: 'D', label: 'Democratic' },
          { value: 'R', label: 'Republican' },
        ]}
        onChange={(party) => update({ party })}
      />
    </div>
  )
}

// Under the President tracker: the electoral college model (simulated from
// the state markets) next to the national market, and the places most
// likely to tip the election, outlined on the map.
function PresidentNotes(props: {
  model: ElectoralModel
  partyContract: Contract | null
  tips: { key: string; p: number }[]
  onPreview: (key: string | undefined) => void
  onPick: (key: string, element: HTMLElement) => void
}) {
  const { model, tips, onPreview, onPick } = props
  const demEv = Math.round(model.meanDemEv)
  return (
    <div className={own.notes}>
      <p className={own.model}>
        <span className={own.modelLabel}>Electoral college model</span>
        <span>
          <b data-tone="dem">Democrats {formatOdds(model.pDem)}</b>
          {' · '}
          <b data-tone="rep">Republicans {formatOdds(model.pRep)}</b>
          {model.pTie >= 0.005 && <> · 269–269 tie {formatOdds(model.pTie)}</>}
        </span>
        <span className={own.muted}>
          Expected electoral votes: D {demEv}, R {538 - demEv}.
          {props.partyContract && (
            <NationalMarket
              contract={props.partyContract}
              modelDem={model.pDem}
            />
          )}
        </span>
      </p>
      {tips.length > 0 && (
        <div className={own.tips}>
          <span className={own.modelLabel}>Tipping points</span>
          {tips.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={(e) => onPick(t.key, e.currentTarget)}
              onPointerEnter={(e) => {
                if (e.pointerType === 'mouse') onPreview(t.key)
              }}
              onPointerLeave={() => onPreview(undefined)}
              onFocus={() => onPreview(t.key)}
              onBlur={() => onPreview(undefined)}
            >
              {t.key}
              <span>{formatOdds(t.p)}</span>
            </button>
          ))}
          <span className={own.muted}>
            How often each puts the winner over 270, in{' '}
            {model.sims.toLocaleString('en-US')} simulations.
          </span>
        </div>
      )}
    </div>
  )
}

function NationalMarket(props: { contract: Contract; modelDem: number }) {
  const contract = useLiveContract(props.contract)
  const national = getPartyProbs(contract)
  if (!national) return null
  return (
    <>
      {' '}
      The national market says Democrats {formatOdds(national.dem)}
      {Math.abs(national.dem - props.modelDem) >= 0.05
        ? ': a gap traders can close from either side.'
        : '.'}
    </>
  )
}

function MapLegend(props: {
  view: MapView
  tracker: ReturnType<typeof mapTracker>
  tipping: boolean
  fills: Record<string, Fill>
}) {
  const { view, tracker, tipping, fills } = props
  if (view.mode === 'primary')
    return (
      <div className={styles.legend}>
        <div className={styles.legendKeys}>
          {tracker.segments.map((s) => (
            <span key={s.key}>
              <i style={{ background: segmentColor(s, view.party) }} />
              {s.label}
            </span>
          ))}
          {view.office === 'P' && (
            <span>
              <i className={own.paleSwatch} />
              Paler: leads with under 30%
            </span>
          )}
          <span>
            <i className={own.noRaceSwatch} />
            No market yet
          </span>
        </div>
      </div>
    )
  const called = Object.values(fills).some((f) => f.kind === 'rating' && f.c)
  return (
    <div className={styles.legend}>
      <div className={styles.ramp}>
        <div>
          <span>Republican</span>
          <span>50 / 50</span>
          <span>Democratic</span>
        </div>
        <div className={styles.gradient} />
      </div>
      <div className={styles.legendKeys}>
        {view.mode !== 'house' && (
          <span>
            <i className={own.noRaceSwatch} />
            No race in 2028
          </span>
        )}
        {tipping && (
          <span>
            <i className={own.tipSwatch} />
            Likeliest tipping points
          </span>
        )}
        {view.mode === 'president' && (
          <span>
            <i className={own.badgeSwatch} />
            Maine and Nebraska: badge = statewide votes
          </span>
        )}
        {called && (
          <span>
            <i style={{ background: '#4a5fa8' }} />
            Darkest: called
          </span>
        )}
      </div>
    </div>
  )
}
