import { ChevronDownIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { sortBy } from 'lodash'
import Link from 'next/link'
import { ReactNode, useMemo, useState } from 'react'

import { Answer } from 'common/answer'
import { getAnswerProbability, getDisplayProbability } from 'common/calculate'
import { Contract, isMultiCpmm } from 'common/contract'
import { Button } from 'web/components/buttons/button'
import { formatOdds, plural } from 'web/components/usa-map/election-display'
import styles from 'web/components/usa-map/election-explorer.module.css'
import { partyProbsToColor } from 'web/components/usa-map/state-election-map'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { useLiveContractWithStatus } from 'web/hooks/use-contract'
import { useContractBySlug } from 'web/hooks/use-contract-by-slug'
import {
  describeFill,
  Fill,
  focusRowKey,
  leaderOf,
  MapView,
  OTHER_LEADER_COLOR,
  PanelRow,
  PanelSection,
  placeTitle,
  primaryRowKey,
  ratingLabel,
  Summary,
  viewRaces,
} from 'web/lib/politics/election-map'
import { PrimaryRow } from 'web/lib/politics/primaries'
import { BoardRace } from 'web/lib/politics/race-board'
import { track } from 'web/lib/service/analytics'
import { AnswerBetModal } from './answer-bet-modal'
import own from './election-map.module.css'
import { TONE_COLOR } from './map-tracker'

// What the map's card says about a place: a few lines on hover, and once a
// place is clicked, its race's market with Bet buttons and every other
// market the page has for the state.

const OPEN_PRIMARY_COLOR = TONE_COLOR.open
const STRENGTH = {
  D: [TONE_COLOR.strength0, TONE_COLOR.strength1, TONE_COLOR.strength2],
  R: ['#e0aaa5', '#c87570', '#9d3336'],
} as const

const mixWithWhite = (hex: string, t: number) => {
  const n = parseInt(hex.slice(1), 16)
  const channel = (shift: number) =>
    Math.round(((n >> shift) & 255) * (1 - t) + 255 * t)
  return `#${((1 << 24) + (channel(16) << 16) + (channel(8) << 8) + channel(0))
    .toString(16)
    .slice(1)}`
}

// A place's color: the 2026 map's blue–red gradient for party odds (called
// races at full strength), the leader's color in a presidential primary.
export function fillColor(fill: Fill | undefined): string | undefined {
  if (!fill) return undefined
  switch (fill.kind) {
    case 'rating': {
      const p = fill.c === 'D' ? 1 : fill.c === 'R' ? 0 : fill.p
      if (fill.c === 'O') return TONE_COLOR.wonO
      return partyProbsToColor(p, 1 - p)
    }
    case 'leader':
      // Paler while the leader is far from sure: most early leads are.
      return fill.won || fill.p === undefined
        ? fill.color
        : mixWithWhite(
            fill.color,
            fill.p >= 0.5 ? 0 : fill.p >= 0.3 ? 0.3 : 0.55
          )
    case 'strength': {
      const p = fill.won ? 1 : fill.p ?? 0
      return STRENGTH[fill.party][p >= 0.9 ? 2 : p >= 0.6 ? 1 : 0]
    }
    case 'open':
      return OPEN_PRIMARY_COLOR
  }
}

const OFFICE_WORD = {
  president: 'presidential',
  senate: 'Senate',
  governor: "governor's",
  house: 'House',
} as const

// "D 55%" in the party's color, and its rating.
export function RaceQuote(props: { race: Pick<BoardRace, 'p' | 'c'> }) {
  const { race } = props
  const party = leaderOf(race)
  if (race.c)
    return (
      <span
        className={styles.quote}
        data-tone={race.c === 'D' ? 'dem' : race.c === 'R' ? 'rep' : 'other'}
      >
        {race.c === 'O' ? 'Called for other' : `Called for ${race.c}`}
      </span>
    )
  return (
    <span className={own.quoteLine}>
      <span
        className={styles.quote}
        data-tone={party === 'D' ? 'dem' : party === 'R' ? 'rep' : undefined}
      >
        {party === 'R'
          ? `R ${formatOdds(1 - race.p)}`
          : party === 'D'
          ? `D ${formatOdds(race.p)}`
          : 'Even'}
      </span>
      <span className={own.rating}>{ratingLabel(race.p)}</span>
    </span>
  )
}

// The state's other 2028 races, one line each, for a hovered place.
function OtherRaces(props: { st: string; view: MapView; races: BoardRace[] }) {
  const { st, view, races } = props
  const lines: [string, ReactNode][] = []
  const one = (o: BoardRace['o']) =>
    races.find((r) => r.o === o && r.st === st && r.d === undefined && !r.sp)
  const add = (label: string, r: BoardRace | undefined) => {
    if (r) lines.push([label, <RaceQuote key={label} race={r} />])
  }
  if (view.mode !== 'president') add('President', one('P'))
  if (view.mode !== 'senate') add('Senate', one('S'))
  if (view.mode !== 'governor') add('Governor', one('G'))
  if (view.mode !== 'house') {
    const house = races.filter((r) => r.o === 'H' && r.st === st)
    if (house.length > 1) {
      const d = house.filter((r) => leaderOf(r) === 'D').length
      const rep = house.filter((r) => leaderOf(r) === 'R').length
      lines.push([
        'House',
        <span key="house" className={own.muted}>
          D leads {d}, R {rep} of {house.length}
        </span>,
      ])
    } else if (house.length === 1) add('House', house[0])
  }
  if (!lines.length) return null
  return (
    <div className={own.others}>
      {lines.map(([label, value]) => (
        <span key={label}>
          <span className={own.muted}>{label}</span>
          {value}
        </span>
      ))}
    </div>
  )
}

// The few lines a hovered place shows next to the pointer.
export function HoverFacts(props: {
  place: string
  view: MapView
  fill: Fill | undefined
  races: BoardRace[]
  tipping?: number
}) {
  const { place, view, fill, races, tipping } = props
  const st = place.split('-')[0]
  if (view.mode === 'primary')
    return fill ? (
      <span className={styles.quote}>{describeFill(fill)}</span>
    ) : (
      <span className={styles.note}>No market for this primary yet.</span>
    )
  const race = viewRaces(view.mode, races)[place]
  return (
    <>
      {race ? (
        <RaceQuote race={race} />
      ) : (
        <span className={styles.note}>
          No {OFFICE_WORD[view.mode]} race in 2028
        </span>
      )}
      {tipping !== undefined && tipping >= 0.005 && (
        <span className={own.tipping}>
          Tipping point in {formatOdds(tipping)} of simulations
        </span>
      )}
      {!place.includes('-') && <OtherRaces st={st} view={view} races={races} />}
    </>
  )
}

// A clicked place: the market behind its color, tradable here, then every
// other market for the state.
export function PinnedPlace(props: {
  place: string
  view: MapView
  sections: PanelSection[]
  primaries: PrimaryRow[]
  tipping?: number
}) {
  const { place, view, sections, primaries, tipping } = props
  const st = place.split('-')[0]
  const focusKey = useMemo(
    () =>
      view.mode === 'primary'
        ? primaryRowKey(view, primaries, st)
        : focusRowKey(view, place),
    [view, place, primaries, st]
  )
  const all = sections.flatMap((s) => s.rows)
  // A state with only a special Senate race (Tennessee) opens that.
  const focus =
    all.find((r) => r.key === focusKey) ??
    (view.mode === 'senate'
      ? all.find((r) => r.key === `${focusKey}-sp`)
      : undefined)
  const rest = sections
    .map((s) => ({ ...s, rows: s.rows.filter((r) => r.key !== focus?.key) }))
    .filter((s) => s.rows.length > 0)
  const restCount = rest.reduce((n, s) => n + s.rows.length, 0)
  return (
    <>
      {focus ? (
        <div className={own.focus}>
          <div className={own.focusHead}>
            <span className={own.focusLabel}>{focus.label}</span>
            <SummaryText summary={focus.summary} />
          </div>
          {tipping !== undefined && tipping >= 0.005 && (
            <span className={own.tipping}>
              Tipping point in {formatOdds(tipping)} of simulations
            </span>
          )}
          <RaceMarket slug={focus.slug} creator={focus.creator} />
        </div>
      ) : (
        <p className={styles.note}>
          {view.mode === 'primary'
            ? 'No market for this primary yet.'
            : `No ${OFFICE_WORD[view.mode]} race here in 2028.`}
        </p>
      )}
      {restCount > 0 && (
        <MoreInState
          // A new place starts closed (open when it has no race here).
          key={place}
          title={`More in ${placeTitle(st)}`}
          count={restCount}
          sections={rest}
          defaultOpen={!focus}
        />
      )}
    </>
  )
}

function MoreInState(props: {
  title: string
  count: number
  sections: PanelSection[]
  defaultOpen: boolean
}) {
  const { title, count, sections } = props
  const [open, setOpen] = useState(props.defaultOpen)
  return (
    <div className={own.more}>
      <button
        type="button"
        aria-expanded={open}
        className={own.moreToggle}
        onClick={() => setOpen(!open)}
      >
        <span>{title}</span>
        <span className={own.moreCount}>{plural(count, 'market')}</span>
        <ChevronDownIcon
          className={clsx(own.chevron, open && own.chevronOpen)}
          aria-hidden
        />
      </button>
      {open &&
        sections.map((s) => (
          <div key={s.key} className={own.moreSection}>
            <span className={styles.eyebrow}>{s.title}</span>
            {s.key === 'house' && s.rows.length > 3 ? (
              <DistrictGrid rows={s.rows} />
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

function SummaryText(props: { summary: Summary }) {
  const { summary } = props
  const party = summary.kind === 'party' ? leaderOf(summary) : undefined
  const tone = party === 'D' ? 'dem' : party === 'R' ? 'rep' : undefined
  return (
    <span className={styles.quote} data-tone={tone}>
      {summaryText(summary)}
    </span>
  )
}

const summaryColor = (summary: Summary) =>
  summary.kind === 'party'
    ? fillColor({ kind: 'rating', p: summary.p, c: summary.c })
    : summary.kind === 'leader'
    ? OTHER_LEADER_COLOR
    : undefined

function RaceRow(props: { row: PanelRow }) {
  const { row } = props
  const [open, setOpen] = useState(false)
  const color = summaryColor(row.summary)
  return (
    <div className={own.row}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          if (!open) track('election map race open', { slug: row.slug })
          setOpen(!open)
        }}
        className={own.rowToggle}
      >
        <span className={own.rowLabel}>
          {color && row.summary.kind === 'party' && (
            <i style={{ backgroundColor: color }} aria-hidden />
          )}
          <span>{row.label}</span>
        </span>
        <span className={own.rowValue}>
          {summaryText(row.summary)}
          <ChevronDownIcon
            className={clsx(own.chevron, open && own.chevronOpen)}
            aria-hidden
          />
        </span>
      </button>
      {open && <RaceMarket slug={row.slug} creator={row.creator} />}
    </div>
  )
}

// A big state's House districts as a grid of chips; one opens at a time.
function DistrictGrid(props: { rows: PanelRow[] }) {
  const [open, setOpen] = useState<string | undefined>()
  const current = props.rows.find((r) => r.key === open)
  return (
    <div className="flex flex-col gap-2">
      <div className={own.districts}>
        {props.rows.map((r) => (
          <button
            key={r.key}
            type="button"
            aria-pressed={r.key === open}
            onClick={() => setOpen(r.key === open ? undefined : r.key)}
          >
            <span>
              <i
                style={{ backgroundColor: summaryColor(r.summary) }}
                aria-hidden
              />
              {r.label.replace(' district', '')}
            </span>
            <span>{summaryText(r.summary)}</span>
          </button>
        ))}
      </div>
      {current && (
        <div className={own.row}>
          <span className={own.focusLabel}>{current.label}</span>
          <RaceMarket slug={current.slug} creator={current.creator} />
        </div>
      )}
    </div>
  )
}

const ANSWERS_SHOWN = 5

// A race's market, loaded when it's shown: its likeliest answers, each with
// a Bet button that trades without leaving the page.
function RaceMarket(props: { slug: string; creator?: string }) {
  const { slug } = props
  const { contract, error } = useContractBySlug(slug)
  const href = `/${props.creator ?? 'ManifoldPolitics'}/${slug}`
  const open = (
    <Link href={href} className={own.marketLink}>
      Open the market →
    </Link>
  )
  if (error)
    return <div className={styles.note}>Couldn&apos;t load it. {open}</div>
  if (!contract) return <LoadingIndicator className="py-3" size="sm" />
  return <LiveRaceMarket initial={contract} open={open} />
}

// The stored copy finds the market; the live one (fetched fresh, then kept
// current over the websocket) prices it. Bets wait for the live one, as on
// the race charts: the bet panel prices every answer.
function LiveRaceMarket(props: { initial: Contract; open: ReactNode }) {
  const { initial, open } = props
  const { contract, hasLoaded } = useLiveContractWithStatus(initial)
  const [answer, setAnswer] = useState<Answer | undefined>()
  if (!isMultiCpmm(contract))
    return (
      <div className={own.marketFoot}>
        <BinaryChance contract={contract} />
        {open}
      </div>
    )
  const answers = sortBy(
    (contract.answers ?? []).filter((a) => a.resolution !== 'CANCEL'),
    (a) => -getAnswerProbability(contract, a.id)
  )
  return (
    <div className={own.answers}>
      {answers.slice(0, ANSWERS_SHOWN).map((a) => (
        <div key={a.id} className={own.answer}>
          <span className={own.answerText}>{a.text}</span>
          <span className={own.answerProb}>
            {formatOdds(getAnswerProbability(contract, a.id))}
          </span>
          {!contract.isResolved && (
            <Button
              size="2xs"
              color="indigo-outline"
              disabled={!hasLoaded}
              onClick={() => {
                track('election map bet', {
                  slug: contract.slug,
                  answer: a.text,
                })
                setAnswer(a)
              }}
            >
              Bet
            </Button>
          )}
        </div>
      ))}
      <div className={own.marketFoot}>
        <span className={own.muted}>
          {answers.length > ANSWERS_SHOWN
            ? `${answers.length - ANSWERS_SHOWN} more on the market`
            : ''}
        </span>
        {open}
      </div>
      <AnswerBetModal
        contract={contract}
        answer={
          answer && hasLoaded
            ? contract.answers.find((x) => x.id === answer.id)
            : undefined
        }
        onClose={() => setAnswer(undefined)}
      />
    </div>
  )
}

function BinaryChance(props: { contract: Contract }) {
  const { contract } = props
  if (contract.outcomeType !== 'BINARY') return <span />
  return (
    <span className={own.answerProb}>
      {formatOdds(getDisplayProbability(contract))} chance
    </span>
  )
}
