import {
  CSSProperties,
  ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import clsx from 'clsx'
import { SearchIcon, AnnotationIcon } from '@heroicons/react/outline'
import { Contract, isMultiCpmm } from 'common/contract'
import { MapContractsDictionary } from 'web/public/data/elections-data'
import { ElectionBalance } from './election-balance'
import { sourceAudit } from './audited-sources'
import { RaceDetailsPanel } from './race-details-panel'
import { useMapCamera } from './use-map-camera'
import { Bounds, Point } from './map-camera'
import { BallotMeasureCard } from './ballot-measure-card'
import {
  BALLOT_MEASURES,
  approvalChance,
  matchesMeasureQuery,
  measureColor,
} from './ballot-measures-model'
import { getHeldOffice, HELD_COLORS } from './election-incumbents'
import { DATA } from './usa-map-data'
import {
  Atlas,
  buildRaces,
  districtId,
  ElectionMode,
  leadingParty,
  matchesRaceQuery,
  matchesStateQuery,
  OTHER_COLOR,
  COMPLEMENT_COLOR,
  outcomeLabel,
  Race,
  raceColor,
  raceTier,
  seatSummary,
  Tier,
  TIERS,
} from './election-map-model'
import { formatOdds, labelInk, LIGHT_LABEL, plural } from './election-display'
import { ExplorerMode, isKnownRace } from './explorer-url'
import { useExplorerUrl } from './use-explorer-url'
import { ChamberTabs, modeName } from './chamber-tabs'
import { MapView, MapViewToggle } from './map-view-toggle'
import { ExplorerHelp } from './explorer-help'
import { ControlCard } from './control-card'
import {
  firstShape,
  isDirection,
  nextShape,
  pathBounds,
  placeHexLabels,
  unionBounds,
} from './map-geometry'
import { DistrictOutcomes, RaceOutcomes } from './race-outcome-rows'
import {
  BallotCandidates,
  CopyRaceLink,
  IncumbentDetails,
  MarketDetailsLink,
  RaceQuote,
  SourceNotes,
  tierTone,
} from './race-summary'
import styles from './election-explorer.module.css'
import interactions from '../us-elections/election-interactions.module.css'

type Props = {
  senate: MapContractsDictionary
  governor: MapContractsDictionary
  senateCandidates: MapContractsDictionary
  governorCandidates: MapContractsDictionary
  house: Contract | null
  additionalHouse?: MapContractsDictionary
  houseControl: Contract | null
  senateControl: Contract | null
  measures?: MapContractsDictionary
}

// Small northeastern states are labelled from a column to their right; their
// map labels would overlap (VT/NH) or not fit.
const CALLOUTS = ['VT', 'NH', 'MA', 'RI', 'CT', 'NJ', 'DE', 'MD']
const calloutY = (i: number) => 191 + i * 29
const UNLABELLED = ['DC', ...CALLOUTS]
// Where the centroid sits on a border or in the sea.
const LABEL_AT: Record<string, Point> = {
  FL: { x: 785, y: 496 },
  LA: { x: 578, y: 449 },
}
// States too small to tap on a phone get an invisible 44px target.
const TINY_STATES = ['RI', 'DE', 'CT', 'NJ', 'VT', 'NH', 'MA', 'MD']
const HIT_RADIUS_PX = 22

type Shape = {
  id: string
  d?: string
  rect?: { x: number; y: number; width: number; height: number; rx: number }
  bounds: Bounds
  center: Point
}

const hexPath = (x: number, y: number, r: number) =>
  Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i - Math.PI / 2
    return `${i ? 'L' : 'M'}${x + Math.cos(angle) * r},${
      y + Math.sin(angle) * r
    }`
  }).join(' ') + 'Z'

const hexLayout = (hex: Atlas['hex']) => {
  const s = Math.min(900 / hex.width, 530 / hex.height)
  return { s, tx: (960 - hex.width * s) / 2, ty: 35 }
}

// Every selectable shape in map coordinates, for drawing, outlines, zooming
// and keyboard movement.
function mapShapes(atlas: Atlas, view: MapView, mode: ExplorerMode): Shape[] {
  if (view === 'map') {
    const source =
      mode === 'house'
        ? atlas.districts.map((d) => ({
            id: districtId(d.state, d.district),
            path: d.path,
            center: d.center,
          }))
        : atlas.states.map((s) => ({
            id: s.state,
            path: s.path,
            center: s.center,
          }))
    return source.map(({ id, path, center }) => {
      const bounds = pathBounds(path) ?? {
        x0: center[0],
        y0: center[1],
        x1: center[0],
        y1: center[1],
      }
      return { id, d: path, bounds, center: { x: center[0], y: center[1] } }
    })
  }
  if (mode === 'house') {
    const { s, tx, ty } = hexLayout(atlas.hex)
    const r = atlas.hex.size * 0.92 * s
    return atlas.hex.hexes.map((h) => {
      const x = tx + h.x * s
      const y = ty + h.y * s
      return {
        id: districtId(h.state, h.district),
        d: hexPath(x, y, r),
        bounds: { x0: x - r, y0: y - r, x1: x + r, y1: y + r },
        center: { x, y },
      }
    })
  }
  return atlas.tiles
    .filter((t) => t.state !== 'DC')
    .map((t) => {
      const x = 76 + t.col * 73
      const y = 20 + t.row * 70
      return {
        id: t.state,
        rect: { x, y, width: 65, height: 62, rx: 6 },
        bounds: { x0: x, y0: y, x1: x + 65, y1: y + 62 },
        center: { x: x + 32.5, y: y + 31 },
      }
    })
}

function Outline(props: { shape: Shape; className: string }) {
  const { shape, className } = props
  return shape.rect ? (
    <rect {...shape.rect} className={className} />
  ) : (
    <path d={shape.d} className={className} />
  )
}

export function ElectionExplorer(props: Props) {
  const [mode, setMode] = useState<ExplorerMode>('senate')
  const isMeasures = mode === 'measures'
  const raceMode: ElectionMode = isMeasures ? 'senate' : mode
  const [view, setView] = useState<MapView>('map')
  const [labels, setLabels] = useState(true)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Tier>()
  const [selected, setSelected] = useState<string>()
  const [hovered, setHovered] = useState<string>()
  const [roving, setRoving] = useState<string>()
  const [focused, setFocused] = useState<string>()
  const mapPointer = useRef<Point>()
  const [sources, setSources] = useState(false)
  const [atlas, setAtlas] = useState<Atlas>()
  const [mapError, setMapError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const selectionOrigin = useRef<HTMLElement | SVGElement | null>(null)
  const explorerRef = useRef<HTMLElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  const pendingFit = useRef<string>()
  const [dockVersion, setDockVersion] = useState(0)
  const headerRef = useRef<HTMLElement>(null)
  const searchZoomed = useRef(false)
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
  const patternId = `unpriced-${uid}`
  const keyHintId = `map-keys-${uid}`
  const races = useMemo(
    () =>
      isMeasures
        ? []
        : buildRaces(
            raceMode,
            mode === 'senate' ? props.senate : props.governor,
            props.house,
            props.additionalHouse
          ),
    [
      mode,
      isMeasures,
      raceMode,
      props.senate,
      props.governor,
      props.house,
      props.additionalHouse,
    ]
  )
  const raceById = useMemo(() => new Map(races.map((r) => [r.id, r])), [races])
  const summary = seatSummary(races, raceMode)
  const shapes = useMemo(
    () => (atlas ? mapShapes(atlas, view, mode) : []),
    [atlas, view, mode]
  )
  const shapeById = useMemo(
    () => new Map(shapes.map((s) => [s.id, s])),
    [shapes]
  )
  const measuresByState = useMemo(
    () =>
      Object.fromEntries(
        Object.keys(DATA).map((state) => [
          state,
          BALLOT_MEASURES.filter((m) => m.state === state),
        ])
      ),
    []
  )
  const measureMatches = BALLOT_MEASURES.filter((m) =>
    matchesMeasureQuery(m, query, DATA[m.state].name)
  )
  const measureCount = (state: string) => measuresByState[state]?.length ?? 0
  const measureQuote = (key: string) => {
    const m = BALLOT_MEASURES.find((m) => m.key === key)!
    return approvalChance(
      m,
      m.source ? props.measures?.[m.source.contractId] : undefined
    )
  }
  const measureStateLabel = (state: string) =>
    measureCount(state)
      ? `${plural(measureCount(state), 'statewide measure')}`
      : 'No statewide measures'
  const selectedRace = selected ? raceById.get(selected) : undefined
  const hoverRace = hovered ? raceById.get(hovered) : undefined
  const selectedNoRace =
    !isMeasures && mode !== 'house' && selected && !selectedRace
      ? DATA[selected]
      : undefined
  const hoveredNoRace =
    !isMeasures && mode !== 'house' && hovered && !hoverRace
      ? DATA[hovered]
      : undefined
  const detailId = selected ?? hovered
  const detailRace = detailId ? raceById.get(detailId) : undefined
  const detailTitle =
    detailRace?.label ?? (detailId ? DATA[detailId]?.name : undefined)
  const matches = (race: Race) =>
    (!filter || raceTier(race) === filter) && matchesRaceQuery(race, query)
  const filtered = races.filter(matches)
  const searching = !!query.trim()
  const narrowed = searching || !!filter
  const noElectionMatches =
    mode === 'house' || filter || !searching
      ? []
      : Object.entries(DATA).filter(
          ([state]) =>
            state !== 'DC' &&
            (isMeasures ? !measureCount(state) : !raceById.has(state)) &&
            matchesStateQuery(state, query)
        )
  const highlighted = !narrowed
    ? []
    : isMeasures
    ? Object.keys(DATA).filter(
        (state) =>
          measureMatches.some((m) => m.state === state) ||
          matchesStateQuery(state, query)
      )
    : [...filtered.map((r) => r.id), ...noElectionMatches.map(([s]) => s)]

  const isSelectable = (id: string) =>
    !!raceById.get(id) || (mode !== 'house' && !!DATA[id] && id !== 'DC')
  const isNavigable = (id: string) => {
    const race = raceById.get(id)
    return race ? matches(race) : isSelectable(id)
  }
  const navigable = shapes.filter((s) => isNavigable(s.id))
  const tabStop =
    roving && navigable.some((s) => s.id === roving)
      ? roving
      : selected && navigable.some((s) => s.id === selected)
      ? selected
      : firstShape(navigable)

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus()
  }, [searchOpen])

  useEffect(() => {
    const abort = new AbortController()
    setMapError(false)
    fetch('/data/election-atlas.json', { signal: abort.signal })
      .then((r) => {
        if (!r.ok) throw new Error('Map unavailable')
        return r.json()
      })
      .then(setAtlas)
      .catch((e) => {
        if (e.name !== 'AbortError') setMapError(true)
      })
    return () => abort.abort()
  }, [attempt])
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

  const boundsOf = (ids: string[]) =>
    unionBounds(ids.map((id) => shapeById.get(id)?.bounds))

  // A deep-linked House district is framed once the map has loaded.
  useEffect(() => {
    const id = pendingFit.current
    if (!id || !shapes.length || mode !== 'house') return
    pendingFit.current = undefined
    const bounds = boundsOf([id])
    // On desktop the race panel opens beside the district; leave it room.
    if (bounds) fit(bounds, 6, window.innerWidth > 850 ? 180 : 0)
    setDockVersion((v) => v + 1)
  }, [shapes, mode, selected])

  // Search frames its results: a single race or one state's districts.
  const highlightKey = searching ? highlighted.join(',') : ''
  useEffect(() => {
    if (!shapes.length) return
    if (!highlightKey) {
      if (searchZoomed.current) resetView()
      searchZoomed.current = false
      return
    }
    const ids = highlightKey.split(',')
    const bounds = boundsOf(ids)
    if (!bounds) return
    fit(bounds, ids.length === 1 && mode !== 'house' ? 3 : 5)
    searchZoomed.current = true
  }, [highlightKey, shapes])

  const closeDetails = () => {
    setSelected(undefined)
    selectionOrigin.current?.focus({ preventScroll: true })
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
  const zoom = (factor: number) => {
    setHovered(undefined)
    zoomMap(factor)
    focusMap()
  }
  const choose = (id: string, element: HTMLElement | SVGElement | null) => {
    selectionOrigin.current = element
    setSelected(id)
    setRoving(id)
    setSearchOpen(false)
    focusMap()
  }
  const changeMode = (next: ExplorerMode) => {
    setMode(next)
    setSelected(undefined)
    setHovered(undefined)
    setFilter(undefined)
    setQuery('')
    setRoving(undefined)
    resetView()
  }
  const changeView = (next: MapView) => {
    if (next === view) return
    setView(next)
    resetView()
    setHovered(undefined)
  }

  // `?office=&race=` links open that tab and race.
  const applyUrl = (nextMode: ExplorerMode, race: string | undefined) => {
    const accepted = race && isKnownRace(nextMode, race) ? race : undefined
    if (nextMode !== mode) changeMode(nextMode)
    setSelected(accepted)
    if (accepted) {
      selectionOrigin.current = null
      setRoving(accepted)
      if (nextMode === 'house') pendingFit.current = accepted
      focusMap()
    }
    return accepted
  }
  useExplorerUrl({ mode, race: selected, apply: applyUrl })

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

  const ariaLabel = (id: string, race?: Race) => {
    if (isMeasures)
      return `${DATA[id]?.name ?? id}: ${measureStateLabel(
        id
      )} on November 3, 2026`
    if (!race) {
      const held = getHeldOffice(raceMode, id)
      return `${DATA[id]?.name ?? id}: no ${modeName(mode)} election in 2026${
        held
          ? `. ${held.members.map((m) => `${m.name}, ${m.party}`).join('; ')}`
          : ''
      }`
    }
    const party = leadingParty(race.odds)
    return `${race.label}, ${
      race.basis?.kind === 'ballot'
        ? `only ${
            race.basis.party === 'D' ? 'Democrats' : 'Republicans'
          } on the ballot`
        : race.basis?.kind === 'decided'
        ? `${race.basis.candidate} elected unopposed`
        : race.basis?.kind === 'candidate-only' || !race.odds
        ? 'no party odds yet'
        : party
        ? `${formatOdds(race.odds[party] ?? 0)} ${outcomeLabel(party)}`
        : 'even'
    }`
  }

  const shapeProps = (id: string) => {
    const race = raceById.get(id)
    const noElection = mode !== 'house' && !race && !!DATA[id] && id !== 'DC'
    const selectable = !!race || noElection
    const held =
      noElection && !isMeasures ? getHeldOffice(raceMode, id) : undefined
    const dimmed = isMeasures
      ? searching &&
        !measureMatches.some((m) => m.state === id) &&
        !matchesStateQuery(id, query)
      : !!race && !matches(race)
    return {
      fill: isMeasures
        ? measureColor(measureCount(id))
        : race
        ? raceColor(race) ?? `url(#${patternId})`
        : held
        ? `url(#${patternId}-${held.control})`
        : undefined,
      className: clsx(
        styles.shape,
        !race && !held && (!isMeasures || !measureCount(id)) && styles.noRace
      ),
      opacity: dimmed ? 0.15 : 1,
      role: selectable ? 'button' : undefined,
      tabIndex: selectable && id === tabStop ? 0 : -1,
      'aria-label': ariaLabel(id, race),
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
  // Callout labels and touch targets for small states select them (in the
  // House, they search that state's districts).
  const tapState = (state: string) => {
    if (mode === 'house') {
      setQuery(DATA[state].name)
      setSelected(undefined)
      return
    }
    choose(state, null)
  }
  const handleTap = (e: React.PointerEvent<SVGSVGElement>) => {
    if (dragged.current || (e.pointerType === 'mouse' && e.button !== 0)) return
    const target = (e.target as Element).closest('[data-tap]')
    if (!target) return
    const states = (target.getAttribute('data-tap') ?? '').split(' ')
    if (states.length === 1) return tapState(states[0])
    // A touch target around a small state: the shape actually under the
    // finger when it is a small state or clearly a larger neighbor, else the
    // small state whose center is nearest.
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

  const labelStyle = (state: string) => {
    const color = isMeasures
      ? measureColor(measureCount(state))
      : (() => {
          const race = raceById.get(state)
          return race ? raceColor(race) : undefined
        })()
    const ink = color ? labelInk(color) : undefined
    return ink
      ? ({
          '--label-ink': ink,
          '--label-halo': ink === LIGHT_LABEL ? '#1e293b80' : '#ffffffa0',
        } as React.CSSProperties)
      : undefined
  }
  const hex = atlas?.hex
  const hexLabels = useMemo(() => {
    if (!atlas || !hex) return []
    const { s, tx, ty } = hexLayout(hex)
    const count = (state: string) =>
      hex.hexes.filter((h) => h.state === state).length
    // Larger delegations keep the spot above their hexes; small ones move.
    const states = atlas.states
      .map((st) => st.state)
      .filter((state) => state !== 'DC')
      .sort((a, b) => count(b) - count(a))
    return placeHexLabels(states, hex.hexes, hex.size).map((l) => ({
      ...l,
      x: tx + l.x * s,
      y: ty + l.y * s,
    }))
  }, [atlas, hex])
  const candidate =
    selectedRace && mode !== 'house'
      ? (mode === 'senate' ? props.senateCandidates : props.governorCandidates)[
          selectedRace.state
        ]
      : null
  const hitRadius = HIT_RADIUS_PX / (pixelsPerUnit * camera.k)
  // Zoomed in, small states have room for their own labels.
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
        onClick={() => {
          resetView()
          searchZoomed.current = false
        }}
      >
        ↺
      </button>
    </div>
  )
  const overlay = (ids: (string | undefined)[], className: string) =>
    ids.map((id) => {
      const shape = id ? shapeById.get(id) : undefined
      return shape ? (
        <Outline
          key={`${className}-${id}`}
          shape={shape}
          className={className}
        />
      ) : null
    })

  return (
    <div className={clsx(styles.layout, interactions.scope)}>
      <div className={styles.controls} aria-label="Chamber control">
        <ControlCard label="Senate" contract={props.senateControl} />
        <ControlCard label="House" contract={props.houseControl} />
      </div>
      <section
        ref={explorerRef}
        className={styles.explorer}
        aria-label="2026 election explorer"
      >
        <header ref={headerRef} className={styles.header}>
          {isMeasures ? (
            <div className={styles.measureOverview}>
              <strong>145 statewide questions</strong>
              <span>39 states · November 3</span>
            </div>
          ) : (
            <ElectionBalance
              summary={summary}
              mode={raceMode}
              filter={filter}
              onFilter={(tier) => {
                setFilter(filter === tier ? undefined : tier)
                setSelected(undefined)
              }}
            />
          )}
          <div className={styles.toolbar}>
            <ChamberTabs mode={mode} onChange={changeMode} />
            <MapViewToggle
              view={view}
              measures={isMeasures}
              house={mode === 'house'}
              onChange={changeView}
            />
            <button
              className={clsx(styles.toolButton, labels && styles.activeTool)}
              aria-label="State labels"
              title="State labels"
              aria-pressed={labels}
              onClick={() => setLabels(!labels)}
            >
              <AnnotationIcon aria-hidden />
              <span>Labels</span>
            </button>
            <div className={styles.searchSlot}>
              <button
                className={clsx(
                  styles.searchToggle,
                  (searchOpen || query) && styles.activeTool
                )}
                aria-label={
                  isMeasures ? 'Search ballot measures' : 'Search races'
                }
                aria-expanded={searchOpen}
                title={isMeasures ? 'Search ballot measures' : 'Search races'}
                onClick={() => setSearchOpen(!searchOpen)}
              >
                <SearchIcon aria-hidden />
              </button>
              <label className={styles.search} data-open={searchOpen}>
                <SearchIcon aria-hidden />
                <input
                  ref={searchRef}
                  aria-label={
                    isMeasures
                      ? 'Find a state, proposition or topic'
                      : 'Find a state or district'
                  }
                  placeholder={
                    isMeasures ? 'State, prop or topic' : 'Find a race'
                  }
                  value={query}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setSearchOpen(false)
                      e.currentTarget
                        .closest('div')
                        ?.querySelector('button')
                        ?.focus()
                    }
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
        <CoverageLine
          isMeasures={isMeasures}
          measuresWithOdds={
            BALLOT_MEASURES.filter((m) => measureQuote(m.key) !== undefined)
              .length
          }
          races={races}
          summary={summary}
          mode={mode}
        />
        {!isMeasures &&
          (summary.leaders.notDem > 0 || summary.leaders.notRep > 0) && (
            <p className={styles.note}>
              {[
                summary.leaders.notDem > 0 &&
                  `${plural(
                    summary.leaders.notDem,
                    'race favors',
                    'races favor'
                  )} a non-Democratic winner`,
                summary.leaders.notRep > 0 &&
                  `${plural(
                    summary.leaders.notRep,
                    'race favors',
                    'races favor'
                  )} a non-Republican winner`,
              ]
                .filter(Boolean)
                .join(' · ')}
              . These outcomes are counted separately from party wins.
            </p>
          )}
        {narrowed && (
          <div className={styles.filterNotice} role="status">
            <span>
              {isMeasures
                ? plural(measureMatches.length, 'matching measure')
                : plural(filtered.length, 'matching race')}
              {filter && ` · ${TIERS.find((t) => t.id === filter)?.label}`}
              {noElectionMatches.length > 0 &&
                ` · ${noElectionMatches.length} with no ${
                  isMeasures ? 'statewide measures' : 'election'
                }`}
            </span>
            <button
              onClick={() => {
                setQuery('')
                setFilter(undefined)
              }}
            >
              Clear {filter && !searching ? 'filter' : 'search'} ×
            </button>
          </div>
        )}
        {narrowed && (
          <div
            className={styles.results}
            role="region"
            aria-label={
              isMeasures
                ? 'Ballot measure search results'
                : filter && !searching
                ? 'Races in this group'
                : 'Race search results'
            }
          >
            {isMeasures &&
              measureMatches.map((m) => (
                <button
                  key={m.key}
                  onClick={(e) => choose(m.state, e.currentTarget)}
                >
                  <span>
                    {DATA[m.state].name} · {m.designation ?? m.title}
                  </span>
                  <span>
                    {measureQuote(m.key) === undefined
                      ? 'No odds yet'
                      : `${formatOdds(measureQuote(m.key)!)} pass`}
                  </span>
                </button>
              ))}
            {filtered.map((r) => (
              <button key={r.id} onClick={(e) => choose(r.id, e.currentTarget)}>
                <span>{r.label}</span> <RaceQuote race={r} />
              </button>
            ))}
            {noElectionMatches.map(([state, data]) => (
              <button
                key={state}
                onClick={(e) => choose(state, e.currentTarget)}
              >
                {data.name}{' '}
                <span>
                  {isMeasures
                    ? 'No statewide measures'
                    : `No ${modeName(mode)} election`}
                </span>
              </button>
            ))}
            {(isMeasures ? measureMatches.length : filtered.length) === 0 &&
              noElectionMatches.length === 0 && (
                <span>
                  {isMeasures
                    ? 'No matching measures. Try a state, Prop 39 or a topic.'
                    : 'No matching races. Try a state name or TX-15.'}
                </span>
              )}
          </div>
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
                'Loading election map…'
              )}
            </div>
          ) : (
            <svg
              ref={svgRef}
              viewBox={viewBox}
              aria-label={`${modeName(mode)} ${
                view === 'map'
                  ? 'geographic map'
                  : isMeasures
                  ? 'state tiles'
                  : 'equal-seat cartogram'
              }`}
              className={styles.map}
              data-mode={mode}
              data-view={view}
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
              <defs>
                {Object.keys(HELD_COLORS).map((party) => (
                  <pattern
                    key={party}
                    id={`${patternId}-${party}`}
                    width="8"
                    height="8"
                    patternUnits="userSpaceOnUse"
                  >
                    <rect
                      width="8"
                      height="8"
                      className={styles.heldBase}
                      data-party={party}
                    />
                    <path
                      d="M0 0L8 8M8 0L0 8"
                      className={styles.heldHatch}
                      data-party={party}
                      strokeWidth="1.5"
                    />
                  </pattern>
                ))}
                <pattern
                  id={patternId}
                  width="6"
                  height="6"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(35)"
                >
                  <rect width="6" height="6" className={styles.hatchBase} />
                  <path
                    d="M0 0V6"
                    className={styles.hatchLine}
                    strokeWidth="2"
                  />
                </pattern>
              </defs>
              <g
                transform={`translate(${camera.x} ${camera.y}) scale(${camera.k})`}
              >
                {shapes.map((shape) =>
                  shape.rect ? (
                    <rect
                      key={shape.id}
                      {...shape.rect}
                      {...shapeProps(shape.id)}
                    />
                  ) : (
                    <path
                      key={shape.id}
                      d={shape.d}
                      {...shapeProps(shape.id)}
                    />
                  )
                )}
                {view === 'map' &&
                  mode === 'house' &&
                  atlas.states.map((s) => (
                    <path
                      key={s.state}
                      d={s.path}
                      className={styles.stateOutline}
                    />
                  ))}
                <g className={styles.overlays} aria-hidden>
                  {overlay(highlighted, styles.matchOutline)}
                  {overlay([selected], styles.selectedHalo)}
                  {overlay([selected], styles.selectedOutline)}
                  {overlay([focused], styles.focusHalo)}
                  {overlay([focused], styles.focusOutline)}
                </g>
                {view === 'map' && labels && (
                  <g aria-hidden>
                    {atlas.states
                      .filter(
                        (s) =>
                          !(zoomedIn ? ['DC'] : UNLABELLED).includes(s.state)
                      )
                      .map((s) => {
                        const at = LABEL_AT[s.state] ?? {
                          x: s.center[0],
                          y: s.center[1],
                        }
                        const held =
                          !isMeasures &&
                          mode !== 'house' &&
                          !raceById.has(s.state) &&
                          !!getHeldOffice(raceMode, s.state)
                        return (
                          <text
                            key={s.state}
                            x={at.x}
                            y={at.y}
                            dy="0.35em"
                            className={clsx(
                              styles.stateLabel,
                              held && styles.heldLabel
                            )}
                            style={
                              mode === 'house' ? undefined : labelStyle(s.state)
                            }
                          >
                            {s.state}
                          </text>
                        )
                      })}
                    {!zoomedIn &&
                      CALLOUTS.map((state, i) => {
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
                            <text
                              x="930"
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
                {view === 'map' && mode !== 'house' && (
                  <g className={styles.hitAreas} aria-hidden>
                    {TINY_STATES.map((state) => {
                      const center = shapeById.get(state)?.center
                      return center ? (
                        <circle
                          key={state}
                          cx={center.x}
                          cy={center.y}
                          r={hitRadius}
                          data-tap={TINY_STATES.join(' ')}
                        />
                      ) : null
                    })}
                  </g>
                )}
                {view === 'cartogram' && mode === 'house' && labels && (
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
                {view === 'cartogram' && mode !== 'house' && (
                  <g aria-hidden>
                    {shapes.map((shape) => (
                      <text
                        key={shape.id}
                        x={shape.center.x}
                        y={shape.center.y}
                        dy="0.35em"
                        className={clsx(
                          styles.tileLabel,
                          !isMeasures &&
                            !raceById.has(shape.id) &&
                            !!getHeldOffice(raceMode, shape.id) &&
                            styles.heldLabel
                        )}
                        style={labelStyle(shape.id)}
                      >
                        {shape.id}
                      </text>
                    ))}
                  </g>
                )}
              </g>
            </svg>
          )}
          <span id={keyHintId} className="sr-only">
            Arrow keys move between races. Enter opens details.
          </span>
          {atlas && zoomControls(styles.stageZoom)}
        </div>
        <Legend
          isMeasures={isMeasures}
          mode={mode}
          showComplement={
            summary.leaders.notDem > 0 || summary.leaders.notRep > 0
          }
        />
        <p className={styles.hint}>
          {view === 'cartogram'
            ? mode === 'house'
              ? 'Cartogram: every House district at equal size. '
              : 'Each tile is one state. '
            : ''}
          {isMeasures
            ? 'Select a state to explore its ballot measures.'
            : 'Select a race to explore the odds.'}{' '}
          Scroll or pinch to zoom; drag to move the map.{' '}
          <button onClick={() => setSources(true)}>More info</button>
        </p>

        {detailTitle && (
          <RaceDetailsPanel
            title={detailTitle}
            eyebrow={
              detailRace
                ? `${modeName(mode)} · ${detailRace.shortLabel}`
                : `2026 · ${modeName(mode)}`
            }
            label={`${detailTitle} ${
              isMeasures ? 'ballot measures' : 'details'
            }`}
            chartLink={
              selected && (
                <>
                  {selectedRace?.contract && (
                    <MarketDetailsLink contract={selectedRace.contract} />
                  )}
                  <CopyRaceLink
                    mode={mode}
                    race={selected}
                    title={detailTitle}
                  />
                </>
              )
            }
            closeRef={closeRef}
            pinned={!!selected}
            pointer={mapPointer}
            onClose={closeDetails}
            dockKey={`${detailTitle}:${dockVersion}`}
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
            {!selected ? (
              isMeasures ? (
                <span>{measureStateLabel(detailId!)} on November 3</span>
              ) : hoverRace ? (
                <>
                  <RaceQuote race={hoverRace} />
                  <BallotCandidates race={hoverRace} />
                  <IncumbentDetails
                    mode={raceMode}
                    state={hoverRace.state}
                    district={hoverRace.district}
                  />
                </>
              ) : hoveredNoRace ? (
                <>
                  <span className={styles.note}>
                    No {modeName(mode)} election in 2026
                  </span>
                  <IncumbentDetails mode={raceMode} state={hovered!} />
                </>
              ) : null
            ) : (
              <>
                {isMeasures && DATA[selected] && (
                  <MeasuresDetails
                    state={selected}
                    measures={
                      searching
                        ? measureMatches.filter((m) => m.state === selected)
                        : measuresByState[selected]
                    }
                    contracts={props.measures}
                    label={measureStateLabel(selected)}
                    total={measureCount(selected)}
                    onShowAll={searching ? () => setQuery('') : undefined}
                  />
                )}
                {selectedNoRace && (
                  <>
                    <p className={styles.empty}>
                      No {mode === 'governor' ? 'gubernatorial' : 'Senate'}{' '}
                      election in 2026.
                    </p>
                    <IncumbentDetails mode={raceMode} state={selected!} />
                    <button
                      className={styles.exploreState}
                      onClick={() => {
                        const name = selectedNoRace.name
                        changeMode('house')
                        setQuery(name)
                      }}
                    >
                      Explore House districts →
                    </button>
                  </>
                )}

                {selectedRace && (
                  <SelectedRace
                    race={selectedRace}
                    mode={raceMode}
                    candidate={
                      candidate &&
                      candidate.id !== selectedRace.contract?.id &&
                      sourceAudit(selectedRace.contract?.slug)?.kind !==
                        'candidate'
                        ? candidate
                        : undefined
                    }
                  />
                )}
              </>
            )}
          </RaceDetailsPanel>
        )}

        <ExplorerHelp
          open={sources}
          setOpen={setSources}
          measures={isMeasures}
        />
      </section>
    </div>
  )
}

function CoverageLine(props: {
  isMeasures: boolean
  measuresWithOdds: number
  races: Race[]
  summary: ReturnType<typeof seatSummary>
  mode: ExplorerMode
}) {
  const { isMeasures, measuresWithOdds, races, summary, mode } = props
  if (isMeasures)
    return (
      <div className={styles.coverage}>
        <span>
          {measuresWithOdds} of {BALLOT_MEASURES.length} measures with market
          odds
        </span>
        <span>Shading shows number of measures, not chance of passage</span>
      </div>
    )
  const priced = races.filter(
    (r) => r.odds && r.basis?.kind !== 'ballot' && r.basis?.kind !== 'decided'
  ).length
  const oneParty = summary.counts['fixed-d'] + summary.counts['fixed-r']
  const status = [
    summary.leaders.unpriced > 0 &&
      `${summary.leaders.unpriced} with no party odds yet`,
    summary.leaders.other > 0 && `${summary.leaders.other} other`,
    summary.leaders.tied > 0 && `${summary.leaders.tied} even`,
  ].filter(Boolean)
  return (
    <div className={styles.coverage}>
      <span>
        {priced} of {races.length} seats with party odds
        {mode === 'house' &&
          oneParty > 0 &&
          ` · ${plural(oneParty, 'seat')} with only one party on the ballot`}
        {mode === 'senate' && ' · 65 seats not on the ballot'}
      </span>
      {status.length > 0 && <span>{status.join(' · ')}</span>}
    </div>
  )
}

function Legend(props: {
  isMeasures: boolean
  mode: ExplorerMode
  showComplement: boolean
}) {
  const { isMeasures, mode, showComplement } = props
  if (isMeasures)
    return (
      <div className={styles.legend}>
        <div className={styles.legendKeys}>
          {[0, 1, 3, 6, 10].map((n, i) => (
            <span key={n}>
              <i
                style={{
                  background: measureColor(n) ?? 'var(--no-measures)',
                  border: '1px solid var(--line)',
                }}
              />
              {['None', '1–2', '3–5', '6–9', '10+'][i]}
            </span>
          ))}
          <span>statewide measures</span>
        </div>
      </div>
    )
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
        <span>
          <i style={{ background: OTHER_COLOR }} />
          Other leads
        </span>
        {showComplement && (
          <span>
            <i style={{ background: COMPLEMENT_COLOR }} />
            Any other winner
          </span>
        )}
        <span>
          <i className={styles.hatchSwatch} />
          No party odds yet
        </span>
        {mode !== 'house' && (
          <span>
            <i className={styles.noRaceSwatch} />
            Not on ballot · current party
          </span>
        )}
      </div>
    </div>
  )
}

function SelectedRace(props: {
  race: Race
  mode: ElectionMode
  candidate?: Contract | null
}) {
  const { race, mode, candidate } = props
  const tier = raceTier(race)
  const portfolio =
    race.answerId &&
    race.contract &&
    isMultiCpmm(race.contract) &&
    race.contract.outcomeType === 'MULTIPLE_CHOICE'
      ? race.contract
      : undefined
  const answer = portfolio?.answers.find((a) => a.id === race.answerId)
  let market: ReactNode = null
  if (!race.contract)
    market = (
      <p className={styles.empty}>
        {race.basis?.kind === 'decided'
          ? 'No election market is needed for this decided seat.'
          : race.basis?.kind === 'ballot'
          ? 'No candidate market is linked yet; the ballot party still counts in the seat bar.'
          : 'No Manifold market is linked to this race yet, so it has no party odds and is left out of the seat estimates.'}
      </p>
    )
  else if (portfolio && answer)
    market = (
      <DistrictOutcomes contract={portfolio} answer={answer} race={race} />
    )
  else
    market = (
      <>
        <RaceOutcomes contract={race.contract} race={race} mode={mode} />
        <SourceNotes contract={race.contract} />
      </>
    )
  return (
    <>
      <div className={styles.detailSummary}>
        <span className={styles.quote} data-tone={tierTone(tier)}>
          {race.basis?.kind === 'candidate-only'
            ? 'Candidate bet only'
            : TIERS.find((t) => t.id === tier)?.label}
        </span>
        {race.odds &&
          race.basis?.kind !== 'ballot' &&
          race.basis?.kind !== 'decided' && <RaceQuote race={race} />}
      </div>
      {race.basis?.kind === 'ballot' && (
        <p className={styles.note}>
          Both November finalists are{' '}
          {race.basis.party === 'D' ? 'Democrats' : 'Republicans'}:{' '}
          {race.basis.finalists.join(' and ')}. This seat counts for that party
          by the certified ballot. Candidate odds are separate.
        </p>
      )}
      {race.basis?.kind === 'decided' && (
        <p className={styles.note}>
          {race.basis.candidate} is unopposed and deemed elected. This seat is
          not on the November ballot.
        </p>
      )}
      <BallotCandidates race={race} />
      {market}
      <IncumbentDetails
        mode={mode}
        state={race.state}
        district={race.district}
      />
      {candidate && (
        <div className={styles.candidates}>
          <div className={styles.candidateHeading}>
            <span className={styles.eyebrow}>Candidate market</span>
            <MarketDetailsLink contract={candidate} />
          </div>
          <RaceOutcomes contract={candidate} race={race} mode={mode} />
          <SourceNotes contract={candidate} />
        </div>
      )}
    </>
  )
}

function MeasuresDetails(props: {
  state: string
  measures: typeof BALLOT_MEASURES
  contracts?: MapContractsDictionary
  label: string
  total: number
  onShowAll?: () => void
}) {
  const { measures, contracts, label, total, onShowAll } = props
  if (total === 0)
    return (
      <p className={styles.note}>
        No statewide measures on the November 3, 2026 ballot.
      </p>
    )
  return (
    <>
      <p className={styles.note}>
        {label}. Pass means approval of the ballot question, including a
        question proposing repeal.
      </p>
      {measures.map((m) => (
        <BallotMeasureCard
          key={m.key}
          measure={m}
          contract={m.source ? contracts?.[m.source.contractId] : undefined}
        />
      ))}
      {onShowAll && (
        <button className={styles.chartLink} onClick={onShowAll}>
          Show all {total} measures →
        </button>
      )}
    </>
  )
}
