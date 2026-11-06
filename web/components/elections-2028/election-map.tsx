import { ChevronDownIcon, XIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { sortBy } from 'lodash'
import Link from 'next/link'
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { Answer } from 'common/answer'
import { getAnswerProbability, getDisplayProbability } from 'common/calculate'
import { Contract, isMultiCpmm } from 'common/contract'
import { getContracts } from 'common/supabase/contracts'
import { Button } from 'web/components/buttons/button'
import { formatOdds } from 'web/components/usa-map/election-display'
import { placeHexLabels } from 'web/components/usa-map/map-geometry'
import { StateProps } from 'web/components/usa-map/presidential-state'
import { DEM_COLOR, REP_COLOR } from 'web/components/usa-map/state-election-map'
import { USAMap } from 'web/components/usa-map/usa-map'
import { DEFAULT_STATE_FILL, USAState } from 'web/components/usa-map/usa-state'
import { ChoicesToggleGroup } from 'web/components/widgets/choices-toggle-group'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { db } from 'web/lib/supabase/db'
import { ratingOf } from 'web/lib/politics/ec-model'
import {
  availableModes,
  closestPlaces,
  describeFill,
  districtKey,
  Fill,
  leaderColors,
  MapMode,
  MapView,
  mapFills,
  OTHER_LEADER_COLOR,
  PanelRow,
  panelTitle,
  PlacedMarket,
  statePanel,
  Summary,
} from 'web/lib/politics/election-map'
import { TERRITORIES } from 'web/lib/politics/official-markets'
import { PrimaryRow } from 'web/lib/politics/primaries'
import { BoardRace } from 'web/lib/politics/race-board'
import { track } from 'web/lib/service/analytics'
import hexFile from 'web/public/data/election-house-hex.json'
import { AnswerBetModal } from './answer-bet-modal'
import { RATING, RATING_ORDER } from './rating-colors'

// The state-by-state map: President (electoral or popular vote), Senate,
// Governor, House (a district cartogram) and the primaries, on one map. The
// President view keeps the plain rating map; any state opens a panel with
// every market the page has for it, each one tradable in place.

const MODE_LABEL: Record<MapMode, string> = {
  president: 'President',
  senate: 'Senate',
  governor: 'Governor',
  house: 'House',
  primary: 'Primaries',
}

// Top-two and top-four primaries: one market for every party.
const OPEN_PRIMARY_COLOR = '#a99fbd'
const OTHER_COLOR = '#8a8a8a'

// A party's Senate or governor primary, shaded by how sure its leader is,
// on the rating ramp's party side.
const STRENGTH = {
  D: [RATING.leanD.fill, RATING.likelyD.fill, RATING.safeD.fill],
  R: [RATING.leanR.fill, RATING.likelyR.fill, RATING.safeR.fill],
} as const

function fillColor(fill: Fill | undefined): string {
  if (!fill) return DEFAULT_STATE_FILL
  switch (fill.kind) {
    case 'rating':
      if (fill.c)
        return fill.c === 'D'
          ? DEM_COLOR
          : fill.c === 'R'
          ? REP_COLOR
          : OTHER_COLOR
      return RATING[ratingOf(fill.p)].fill
    case 'leader':
      return fill.color
    case 'strength': {
      const p = fill.won ? 1 : fill.p ?? 0
      return STRENGTH[fill.party][p >= 0.9 ? 2 : p >= 0.6 ? 1 : 0]
    }
    case 'open':
      return OPEN_PRIMARY_COLOR
  }
}

type HexFile = {
  size: number
  width: number
  height: number
  hexes: { state: string; district: number; x: number; y: number }[]
}
const HEX = hexFile as HexFile

const DEFAULT_VIEW: MapView = {
  mode: 'president',
  president: 'ev',
  office: 'P',
  party: 'D',
}

export function ElectionMap(props: {
  races: BoardRace[]
  primaries: PrimaryRow[]
  offYear: Contract[]
  defaultMode: MapMode
}) {
  const { races, primaries } = props
  const modes = useMemo(
    () => availableModes(races, primaries),
    [races, primaries]
  )
  const [saved, setView] = usePersistentInMemoryState<MapView | undefined>(
    undefined,
    'election-map-view'
  )
  const start = modes.includes(props.defaultMode) ? props.defaultMode : modes[0]
  const view: MapView = saved ?? { ...DEFAULT_VIEW, mode: start ?? 'president' }
  const mode = modes.includes(view.mode) ? view.mode : start
  const shown = { ...view, mode: mode ?? view.mode }
  const [selected, setSelected] = useState<string | undefined>()
  const [hovered, setHovered] = useState<string | undefined>()

  const fills = useMemo(
    () => mapFills(shown, races, primaries),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown.mode, shown.president, shown.office, shown.party, races, primaries]
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

  if (!mode) return null

  const update = (patch: Partial<MapView>) => {
    track('election map view', { ...shown, ...patch })
    setView({ ...shown, ...patch })
  }
  const select = (place: string | undefined) => {
    if (place) track('election map place', { place, mode })
    setSelected(place === selected ? undefined : place)
  }

  // The hovered place's line, else the selected one's.
  const focus = hovered ?? selected
  const focusState = focus?.split('-')[0]

  return (
    <div className="flex flex-col gap-3">
      <MapControls view={shown} modes={modes} update={update} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="bg-canvas-0 border-ink-200 flex flex-col gap-2 rounded-xl border p-2 sm:p-3">
          {mode === 'house' ? (
            <HouseHexMap
              fills={fills}
              selectedState={selected?.split('-')[0]}
              hovered={hovered}
              onHover={setHovered}
              onSelect={select}
            />
          ) : (
            <FillsContext.Provider value={fills}>
              <USAMap
                mapContractsDictionary={{}}
                handleClick={(key) => select(key)}
                onMouseEnter={setHovered}
                onMouseLeave={() => setHovered(undefined)}
                targetState={selected}
                hoveredState={hovered}
                CustomStateComponent={FillState}
              />
            </FillsContext.Provider>
          )}
          <PlaceChips
            view={shown}
            fills={fills}
            selected={selected}
            onSelect={select}
          />
          <div className="text-ink-700 flex min-h-[2.25rem] flex-wrap items-center justify-between gap-x-3 px-1 text-sm">
            {focus && focusState ? (
              <>
                <span className="text-ink-1000 font-semibold">
                  {placeLabel(focus)}
                </span>
                <span className="tabular-nums">
                  {fills[focus] ? describeFill(fills[focus]) : 'No race'}
                </span>
              </>
            ) : (
              <span className="text-ink-500">
                Tap a state for all its races and primaries.
              </span>
            )}
          </div>
          <MapLegend view={shown} fills={fills} primaries={primaries} />
        </div>
        {selected ? (
          <PlacePanel
            place={selected.split('-')[0]}
            focus={selected.includes('-') ? selected : undefined}
            races={races}
            primaries={primaries}
            more={more}
            onClose={() => setSelected(undefined)}
          />
        ) : (
          <ClosestPanel view={shown} fills={fills} onSelect={select} />
        )}
      </div>
    </div>
  )
}

function placeLabel(place: string) {
  const [st, d] = place.split('-')
  if (d === undefined) return panelTitle(st)
  const n = Number(d)
  return n === 0 ? `${st} at-large` : `${st}-${n}`
}

function MapControls(props: {
  view: MapView
  modes: MapMode[]
  update: (patch: Partial<MapView>) => void
}) {
  const { view, modes, update } = props
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <ChoicesToggleGroup
        currentChoice={view.mode}
        choicesMap={Object.fromEntries(modes.map((m) => [MODE_LABEL[m], m]))}
        setChoice={(m) => update({ mode: m as MapMode })}
        color="gray"
        ariaLabel="Map"
        toggleClassName="!px-3 !py-1 text-sm"
      />
      {view.mode === 'president' && (
        <ChoicesToggleGroup
          currentChoice={view.president}
          choicesMap={{ 'Electoral votes': 'ev', 'Popular vote': 'popular' }}
          setChoice={(p) => update({ president: p as MapView['president'] })}
          color="gray"
          ariaLabel="President map"
          toggleClassName="!px-2.5 !py-1 text-xs"
        />
      )}
      {view.mode === 'primary' && (
        <div className="flex flex-wrap gap-2">
          <ChoicesToggleGroup
            currentChoice={view.office}
            choicesMap={{ President: 'P', Senate: 'S', Governor: 'G' }}
            setChoice={(o) => update({ office: o as MapView['office'] })}
            color="gray"
            ariaLabel="Primary for"
            toggleClassName="!px-2.5 !py-1 text-xs"
          />
          <ChoicesToggleGroup
            currentChoice={view.party}
            choicesMap={{ Democratic: 'D', Republican: 'R' }}
            setChoice={(p) => update({ party: p as MapView['party'] })}
            color="gray"
            ariaLabel="Party"
            toggleClassName="!px-2.5 !py-1 text-xs"
          />
        </div>
      )}
    </div>
  )
}

// USAMap renders the component type it's given, which must be stable; the
// fills come through context.
const FillsContext = createContext<Record<string, Fill>>({})

function FillState(p: StateProps) {
  const fill = useContext(FillsContext)[p.stateKey]
  return (
    <USAState
      state={p.stateKey}
      stateData={p.data}
      fill={fillColor(fill)}
      onMouseEnterState={() => p.onMouseEnter(p.stateKey)}
      onMouseLeaveState={p.onMouseLeave}
      onClickState={() => p.handleClick(p.stateKey)}
      hovered={p.hoveredState === p.stateKey}
      selected={p.targetState === p.stateKey}
    />
  )
}

// Places the state map can't show: Maine's and Nebraska's electoral
// districts, and the territories and Democrats Abroad in the presidential
// primaries.
function PlaceChips(props: {
  view: MapView
  fills: Record<string, Fill>
  selected: string | undefined
  onSelect: (place: string) => void
}) {
  const { view, fills, selected, onSelect } = props
  const keys =
    view.mode === 'president' && view.president === 'ev'
      ? Object.keys(fills).filter((k) => k.includes('-'))
      : view.mode === 'primary'
      ? Object.keys(fills).filter((k) => k in TERRITORIES)
      : []
  if (keys.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5 px-1">
      {sortBy(keys).map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onSelect(k)}
          className={clsx(
            'border-ink-200 hover:bg-canvas-50 flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs',
            selected === k && 'ring-primary-500 ring-2'
          )}
        >
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: fillColor(fills[k]) }}
          />
          <span className="text-ink-900 font-medium">
            {k in TERRITORIES ? TERRITORIES[k] : k}
          </span>
          <span className="text-ink-600 tabular-nums">
            {describeFill(fills[k])}
          </span>
        </button>
      ))}
    </div>
  )
}

function MapLegend(props: {
  view: MapView
  fills: Record<string, Fill>
  primaries: PrimaryRow[]
}) {
  const { view, primaries } = props
  const swatch = (color: string, label: string) => (
    <span key={label} className="flex items-center gap-1">
      <span
        className="h-2.5 w-2.5 rounded-sm"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  )
  let items: ReactNode[]
  if (view.mode === 'primary' && view.office === 'P') {
    const colors = leaderColors(primaries, view.party)
    items = [
      ...Object.entries(colors).map(([name, color]) => swatch(color, name)),
      swatch(OTHER_LEADER_COLOR, 'Someone else leads'),
    ]
  } else if (view.mode === 'primary') {
    const party = view.party
    items = [
      swatch(STRENGTH[party][0], 'Leader under 60%'),
      swatch(STRENGTH[party][1], '60–90%'),
      swatch(STRENGTH[party][2], '90%+'),
      swatch(OPEN_PRIMARY_COLOR, 'Top-two or top-four primary'),
      swatch(DEFAULT_STATE_FILL, 'No market'),
    ]
  } else {
    items = [
      ...RATING_ORDER.map((r) => swatch(RATING[r].fill, RATING[r].label)),
      swatch(DEFAULT_STATE_FILL, 'No race'),
    ]
  }
  return (
    <div className="text-ink-600 flex flex-wrap gap-x-3 gap-y-1 px-1 text-xs">
      {items}
    </div>
  )
}

// ---------------------------------------------------------------------------
// House cartogram
// ---------------------------------------------------------------------------

const hexPath = (x: number, y: number, r: number) =>
  Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i - Math.PI / 2
    return `${i ? 'L' : 'M'}${(x + Math.cos(angle) * r).toFixed(1)},${(
      y +
      Math.sin(angle) * r
    ).toFixed(1)}`
  }).join(' ') + 'Z'

const HEX_W = 960
const HEX_SCALE = Math.min(920 / HEX.width, 560 / HEX.height)
const HEX_TX = (HEX_W - HEX.width * HEX_SCALE) / 2
const HEX_TY = 24
const HEX_H = Math.ceil(HEX.height * HEX_SCALE + HEX_TY * 2)
const HEX_R = HEX.size * 0.92 * HEX_SCALE

function HouseHexMap(props: {
  fills: Record<string, Fill>
  selectedState: string | undefined
  hovered: string | undefined
  onHover: (key: string | undefined) => void
  onSelect: (key: string) => void
}) {
  const { fills, selectedState, hovered, onHover, onSelect } = props
  const labels = useMemo(() => {
    const count = (st: string) => HEX.hexes.filter((h) => h.state === st).length
    // Larger delegations keep the spot above their hexes; small ones move.
    const states = sortBy(
      [...new Set(HEX.hexes.map((h) => h.state))],
      (st) => -count(st)
    )
    return placeHexLabels(states, HEX.hexes, HEX.size).map((l) => ({
      ...l,
      x: HEX_TX + l.x * HEX_SCALE,
      y: HEX_TY + l.y * HEX_SCALE,
    }))
  }, [])
  return (
    <svg
      viewBox={`0 0 ${HEX_W} ${HEX_H}`}
      className="h-auto w-full"
      role="img"
      aria-label="House districts, one hexagon each, colored by our odds"
      onPointerLeave={() => onHover(undefined)}
    >
      {HEX.hexes.map((h) => {
        const key = districtKey(h.state, h.district)
        const x = HEX_TX + h.x * HEX_SCALE
        const y = HEX_TY + h.y * HEX_SCALE
        const inState = h.state === selectedState
        return (
          <path
            key={key}
            d={hexPath(x, y, HEX_R)}
            fill={fillColor(fills[key])}
            className={clsx(
              'cursor-pointer',
              inState || hovered === key ? 'stroke-ink-1000' : 'stroke-canvas-0'
            )}
            strokeWidth={inState || hovered === key ? 2 : 1}
            onPointerEnter={() => onHover(key)}
            onClick={() => onSelect(key)}
          />
        )
      })}
      {labels.map((l) => (
        <text
          key={l.state}
          x={l.x}
          y={l.y}
          textAnchor={l.anchor}
          dominantBaseline="middle"
          className="fill-ink-900 pointer-events-none text-[13px] font-semibold"
        >
          {l.state}
        </text>
      ))}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------

const panelClass =
  'bg-canvas-0 border-ink-200 flex max-h-[44rem] flex-col gap-3 overflow-y-auto rounded-xl border p-3 sm:p-4'

// Before a place is picked: the closest contests in the view.
function ClosestPanel(props: {
  view: MapView
  fills: Record<string, Fill>
  onSelect: (place: string) => void
}) {
  const { view, fills, onSelect } = props
  const closest = closestPlaces(fills, 8)
  return (
    <div className={panelClass}>
      <div className="flex flex-col gap-0.5">
        <h3 className="text-ink-1000 text-base font-semibold">
          {view.mode === 'primary' ? 'Most open contests' : 'Closest races'}
        </h3>
        <p className="text-ink-600 text-sm">
          Pick one, or any state on the map, for all its markets.
        </p>
      </div>
      <div className="flex flex-col gap-1">
        {closest.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onSelect(k)}
            className="hover:bg-canvas-50 flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm"
          >
            <span className="flex items-center gap-2">
              <span
                className="h-3 w-3 shrink-0 rounded-sm"
                style={{ backgroundColor: fillColor(fills[k]) }}
              />
              <span className="text-ink-1000 font-medium">{placeLabel(k)}</span>
            </span>
            <span className="text-ink-700 tabular-nums">
              {describeFill(fills[k])}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function PlacePanel(props: {
  place: string
  focus: string | undefined
  races: BoardRace[]
  primaries: PrimaryRow[]
  more: PlacedMarket[]
  onClose: () => void
}) {
  const { place, focus, races, primaries, more, onClose } = props
  const sections = useMemo(
    () => statePanel(place, races, primaries, more),
    [place, races, primaries, more]
  )
  return (
    <div className={panelClass} aria-label={`${panelTitle(place)} markets`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-ink-1000 text-lg font-semibold">
          {panelTitle(place)}
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-ink-500 hover:text-ink-800 rounded p-1"
        >
          <XIcon className="h-5 w-5" />
        </button>
      </div>
      {sections.length === 0 && (
        <p className="text-ink-600 text-sm">No markets here yet.</p>
      )}
      {sections.map((s) => (
        <div key={s.key} className="flex flex-col gap-1">
          <h4 className="text-ink-600 text-xs font-semibold uppercase tracking-wide">
            {s.title}
          </h4>
          {s.key === 'house' && s.rows.length > 3 ? (
            <DistrictGrid
              rows={s.rows}
              focus={focus ? `H-${focus}` : undefined}
            />
          ) : (
            s.rows.map((r) => <RaceRow key={r.key} row={r} />)
          )}
        </div>
      ))}
    </div>
  )
}

function summaryText(summary: Summary) {
  if (summary.kind === 'party')
    return describeFill({ kind: 'rating', p: summary.p, c: summary.c })
  if (summary.kind === 'leader')
    return describeFill({
      kind: 'open',
      name: summary.name,
      p: summary.p,
      won: summary.won,
    })
  return ''
}

function summaryColor(summary: Summary) {
  return summary.kind === 'party'
    ? fillColor({ kind: 'rating', p: summary.p, c: summary.c })
    : undefined
}

function RaceRow(props: { row: PanelRow; initiallyOpen?: boolean }) {
  const { row } = props
  const [open, setOpen] = useState(!!props.initiallyOpen)
  const color = summaryColor(row.summary)
  return (
    <div className="border-ink-100 border-b last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          if (!open) track('election map race open', { slug: row.slug })
          setOpen(!open)
        }}
        className="hover:bg-canvas-50 flex w-full items-center justify-between gap-3 rounded-md px-1.5 py-2 text-left text-sm"
      >
        <span className="text-ink-1000 flex min-w-0 items-center gap-2">
          {color && (
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: color }}
            />
          )}
          <span className="min-w-0">{row.label}</span>
        </span>
        <span className="text-ink-700 flex shrink-0 items-center gap-1 tabular-nums">
          {summaryText(row.summary)}
          <ChevronDownIcon
            className={clsx(
              'text-ink-400 h-4 w-4 transition-transform',
              open && 'rotate-180'
            )}
          />
        </span>
      </button>
      {open && <RaceMarket slug={row.slug} creator={row.creator} />}
    </div>
  )
}

// A big state's House districts as a grid of chips; one opens at a time.
function DistrictGrid(props: { rows: PanelRow[]; focus: string | undefined }) {
  const [open, setOpen] = useState<string | undefined>(props.focus)
  const current = props.rows.find((r) => r.key === open)
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-1">
        {props.rows.map((r) => (
          <button
            key={r.key}
            type="button"
            aria-pressed={r.key === open}
            onClick={() => setOpen(r.key === open ? undefined : r.key)}
            className={clsx(
              'border-ink-200 hover:bg-canvas-50 flex items-center justify-between gap-1 rounded-md border px-1.5 py-1 text-xs',
              r.key === open && 'ring-primary-500 ring-2'
            )}
          >
            <span className="text-ink-900 flex items-center gap-1 font-medium">
              <span
                className="h-2 w-2 rounded-sm"
                style={{ backgroundColor: summaryColor(r.summary) }}
              />
              {r.label.replace(' district', '')}
            </span>
            <span className="text-ink-600 tabular-nums">
              {summaryText(r.summary)}
            </span>
          </button>
        ))}
      </div>
      {current && (
        <div className="border-ink-100 rounded-md border px-1.5">
          <div className="text-ink-1000 pt-2 text-sm font-medium">
            {current.label}
          </div>
          <RaceMarket slug={current.slug} creator={current.creator} />
        </div>
      )}
    </div>
  )
}

const ANSWERS_SHOWN = 6

// A race's market, loaded when its row opens: its likeliest answers, each
// with a Bet button that trades without leaving the page.
function RaceMarket(props: { slug: string; creator?: string }) {
  const { slug } = props
  const { contract, error, refresh } = useContractBySlug(slug)
  const [answer, setAnswer] = useState<Answer | undefined>()
  const href = `/${props.creator ?? 'ManifoldPolitics'}/${slug}`
  const open = (
    <Link
      href={href}
      className="text-primary-700 text-xs font-medium hover:underline"
    >
      Open the market →
    </Link>
  )
  if (error)
    return (
      <div className="text-ink-600 px-1.5 pb-2 text-sm">
        Couldn&apos;t load it. {open}
      </div>
    )
  if (!contract) return <LoadingIndicator className="py-3" size="sm" />
  if (!isMultiCpmm(contract))
    return (
      <div className="text-ink-700 flex items-center justify-between px-1.5 pb-2 text-sm">
        <BinaryChance contract={contract} />
        {open}
      </div>
    )
  const answers = sortBy(
    contract.answers.filter((a) => a.resolution !== 'CANCEL'),
    (a) => -getAnswerProbability(contract, a.id)
  )
  return (
    <div className="flex flex-col gap-1 px-1.5 pb-2">
      {answers.slice(0, ANSWERS_SHOWN).map((a) => (
        <div
          key={a.id}
          className="flex items-center justify-between gap-2 text-sm"
        >
          <span className="text-ink-900 min-w-0 truncate">{a.text}</span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="text-ink-700 tabular-nums">
              {formatOdds(getAnswerProbability(contract, a.id))}
            </span>
            {!contract.isResolved && (
              <Button
                size="2xs"
                color="indigo-outline"
                onClick={() => {
                  track('election map bet', { slug, answer: a.text })
                  setAnswer(a)
                }}
              >
                Bet
              </Button>
            )}
          </span>
        </div>
      ))}
      <div className="flex justify-between pt-1">
        <span className="text-ink-500 text-xs">
          {answers.length > ANSWERS_SHOWN
            ? `${answers.length - ANSWERS_SHOWN} more on the market`
            : ''}
        </span>
        {open}
      </div>
      <AnswerBetModal
        contract={contract}
        answer={answer}
        onClose={() => {
          setAnswer(undefined)
          refresh()
        }}
      />
    </div>
  )
}

// The full market (the bet panel prices every answer), by slug. `error`
// when it can't be read or doesn't exist.
function useContractBySlug(slug: string) {
  const [contract, setContract] = useState<Contract | undefined>()
  const [error, setError] = useState(false)
  const load = useCallback(() => {
    getContracts(db, [slug], 'slug')
      .then(([c]) => {
        if (c) setContract(c)
        else setError(true)
      })
      .catch(() => setError(true))
  }, [slug])
  useEffect(() => {
    setContract(undefined)
    setError(false)
    load()
  }, [load])
  return { contract, error, refresh: load }
}

function BinaryChance(props: { contract: Contract }) {
  const { contract } = props
  if (contract.outcomeType !== 'BINARY') return <span />
  return (
    <span className="tabular-nums">
      {formatOdds(getDisplayProbability(contract))} chance
    </span>
  )
}
