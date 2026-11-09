import clsx from 'clsx'
import Image from 'next/image'
import Link from 'next/link'
import { maxBy } from 'lodash'
import { useMemo, useState } from 'react'

import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { getAnswerProbability } from 'common/calculate'
import {
  Contract,
  contractPath,
  isMultiCpmm,
  MultiContract,
} from 'common/contract'
import { formatOdds } from 'web/components/usa-map/election-display'
import { DEM_COLOR, REP_COLOR } from 'web/components/usa-map/state-election-map'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { useLiveContract } from 'web/hooks/use-contract'
import { useIsVisible } from 'web/hooks/use-is-visible'
import {
  Bucket,
  orderedBuckets,
  otherNominee,
  sideTotal,
} from 'web/lib/politics/election-glance'
import { settledOrPrice } from 'web/lib/politics/race-board'
import { dayAgoProbs } from 'web/lib/politics/senate-seats'
import { track } from 'web/lib/service/analytics'
import { useQuickBet } from './quick-bet'

// How many seats each party holds after an election, as the live 2026
// page's seat chart: one bar per range, shaded by who would run the
// chamber, with the chances 24 hours ago outlined behind. The markets
// ("How many Senate seats will Democrats hold", "How many House seats will
// Democrats win") count the Democrats'; one toggle over both charts reads
// them from the Republicans' side (100 or 435 minus each range). A 50–50
// Senate is neither party's majority: grey, with the line at 51.

type Party = 'D' | 'R'

type Chamber = {
  key: 'senate' | 'house'
  name: string
  total: number
  line: number
  tie?: number
  rule: string
  rules: (year: number) => string
}

const SENATE: Chamber = {
  key: 'senate',
  name: 'Senate',
  total: 100,
  line: 51,
  tie: 50,
  rule: '51 for a majority; the Vice President breaks a 50–50 tie',
  rules: (year) =>
    `Counts the senators in each party's caucus (independents with the party they caucus with) when the new Congress meets in January ${
      year + 1
    }: every seat, not only those up in ${year}. 51 is a majority; at 50–50 the Vice President's party runs the Senate. The market counts Democratic seats; Republican seats are the rest, assuming every senator caucuses with one of the two parties.`,
}

const HOUSE: Chamber = {
  key: 'house',
  name: 'House',
  total: 435,
  line: 218,
  rule: '218 for a majority',
  rules: (year) =>
    `Counts the House seats each party wins in the ${year} elections, runoffs included; independents count with the party they caucus with. 218 is a majority. The market counts Democratic seats; Republican seats are the rest, assuming every seat goes to one of the two parties.`,
}

const PARTY_NAME: Record<Party, string> = { D: 'Democratic', R: 'Republican' }

// The live page's tones.
const NEUTRAL_FILL = '#9e9fbd'
const TINT = {
  D: 'rgb(86 113 186 / 0.08)',
  R: 'rgb(194 85 85 / 0.08)',
  tie: 'rgb(158 159 189 / 0.12)',
}
const TEXT = {
  D: 'text-[#4f69b3] dark:text-[#93a7e2]',
  R: 'text-[#b84a4a] dark:text-[#ec9393]',
  tie: 'text-ink-700',
}
const FILL = { D: DEM_COLOR, R: REP_COLOR, tie: NEUTRAL_FILL }

const outcomeOf = (side: Bucket['side']) =>
  side === 'tie'
    ? '50–50: the Vice President’s party'
    : `${PARTY_NAME[side]} majority`

export function SeatCharts(props: {
  senate?: Contract
  house?: Contract
  year: number
}) {
  const { senate, house, year } = props
  const [view, setView] = usePersistentInMemoryState<Party>(
    'D',
    `election-seat-charts-view-${year}`
  )
  if (!senate && !house) return null
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-end gap-2">
        <span className="text-ink-500 text-xs">Count seats for</span>
        <span
          role="group"
          aria-label="Whose seats"
          className="bg-canvas-50 flex shrink-0 rounded-md p-0.5 text-xs"
        >
          {(['D', 'R'] as const).map((party) => (
            <button
              key={party}
              type="button"
              aria-pressed={view === party}
              onClick={() => setView(party)}
              className={clsx(
                'rounded px-2 py-0.5',
                view === party
                  ? 'bg-canvas-0 text-ink-1000 font-semibold shadow-sm'
                  : 'text-ink-600 hover:text-ink-900'
              )}
            >
              {party === 'D' ? 'Democrats' : 'Republicans'}
            </button>
          ))}
        </span>
      </div>
      <div
        className={clsx(
          'grid items-start gap-4',
          senate && house && 'md:grid-cols-2'
        )}
      >
        {senate && (
          <SeatChart
            contract={senate}
            chamber={SENATE}
            year={year}
            view={view}
          />
        )}
        {house && (
          <SeatChart contract={house} chamber={HOUSE} year={year} view={view} />
        )}
      </div>
    </div>
  )
}

function SeatChart(props: {
  contract: Contract
  chamber: Chamber
  year: number
  view: Party
}) {
  const { contract } = props
  if (!isMultiCpmm(contract) || contract.outcomeType !== 'MULTIPLE_CHOICE')
    return null
  return <Chart {...props} contract={contract} />
}

type Bar = Bucket & { dayAgo: number | undefined }

function Chart(props: {
  contract: MultiContract
  chamber: Chamber
  year: number
  view: Party
}) {
  const { chamber, year } = props
  const live = useLiveContract(props.contract)
  // 24h-ago chances come from the page snapshot, not the live market.
  const dayAgo = useMemo(() => dayAgoProbs(props.contract), [props.contract])
  const dem = useMemo(
    () =>
      orderedBuckets(
        live.answers.map((a) => ({
          id: a.id,
          text: a.text,
          // A resolved market by its result, not its last prices.
          p: settledOrPrice(live, a.id, (id) => getAnswerProbability(live, id)),
        })),
        chamber.line,
        chamber.tie
      ),
    [live, chamber]
  )
  const rep = useMemo(
    () =>
      dem
        ? otherNominee(dem, chamber.total, chamber.line, chamber.tie)
        : undefined,
    [dem, chamber]
  )
  // The Republican reading needs answers that read as counts.
  const view: Party = props.view === 'R' && rep ? 'R' : 'D'
  const bars: Bar[] = useMemo(
    () =>
      ((view === 'R' ? rep : dem) ?? []).map((b) => ({
        ...b,
        dayAgo: live.isResolved ? undefined : dayAgo[b.id],
      })),
    [view, rep, dem, dayAgo, live.isResolved]
  )
  const [activeId, setActiveId] = useState<string>()
  const { open, dialog } = useQuickBet(`election ${chamber.key} seats chart`)
  // Bars rise once the card scrolls into view.
  const [revealed, setRevealed] = useState(false)
  const { ref } = useIsVisible(() => setRevealed(true), true)

  const winner = live.isResolved ? bars.find((b) => b.p >= 1) : undefined
  const mostLikely = maxBy(bars, (b) => b.p)
  const shown = bars.find((b) => b.id === activeId) ?? winner ?? mostLikely
  if (!dem || !bars.length || !shown) return null
  const tradable =
    !live.isResolved && (live.closeTime == null || live.closeTime > Date.now())

  const top = Math.max(0.01, ...bars.map((b) => Math.max(b.p, b.dayAgo ?? 0)))
  // The tallest bar stops short of the top, leaving room for its label.
  const height = (p: number) => (revealed ? `${(p / top) * 84}%` : '0%')
  // Regions in bar order: the near side, a tie, the far side (the line
  // goes where the far side starts).
  const sides = bars.reduce<Bucket['side'][]>(
    (out, b) => (out.includes(b.side) ? out : [...out, b.side]),
    []
  )
  const far = bars[bars.length - 1].side
  const lineAt = bars.findIndex((b) => b.side === far)
  const moved = (b: Bar) =>
    b.dayAgo !== undefined && Math.abs(b.p - b.dayAgo) >= 0.005
  const anyMoved = bars.some(moved)
  const longLabels = bars.some((b) => b.label.length > 5)
  const party = PARTY_NAME[view]
  const seatsWord = chamber.key === 'senate' ? 'holding' : 'winning'

  const bet = (b: Bar) => {
    if (!tradable) return
    track('click election seats bar', { chamber: chamber.key, seats: b.text })
    const answer = dem.find((x) => x.id === b.id)
    open({
      contract: live,
      answerId: b.id,
      note:
        view === 'R' && answer
          ? `Republicans ${seatsWord} ${b.text} ${chamber.name} seats is the same outcome as Democrats ${seatsWord} ${answer.text}, so this bets on that answer.`
          : undefined,
    })
  }

  return (
    <div
      ref={ref}
      className="bg-canvas-0 border-ink-200 flex flex-col rounded-xl border p-3 sm:p-4"
    >
      <div className="flex items-baseline justify-between gap-1.5 text-sm font-semibold">
        <h3 className="text-ink-1000 flex items-center gap-1">
          {party} {chamber.name} seats after {year}
          <InfoTooltip
            size="sm"
            text={chamber.rules(year)}
            tooltipParams={{ className: 'text-xs font-normal' }}
          />
        </h3>
        <Link
          href={contractPath(live)}
          className="text-ink-500 hover:text-primary-700 shrink-0 text-xs font-normal hover:underline"
        >
          Market →
        </Link>
      </div>

      <Readout
        bar={shown}
        view={view}
        caption={
          shown === winner
            ? 'Final count'
            : shown === mostLikely
            ? 'Most likely'
            : undefined
        }
        showChange={!live.isResolved}
      />

      <div className="mt-3" onMouseLeave={() => setActiveId(undefined)}>
        <div className="flex text-[11px] leading-tight sm:text-xs">
          {sides.map((side, i) => {
            const n = bars.filter((b) => b.side === side).length
            return (
              <div
                key={side}
                style={{ flex: n, backgroundColor: TINT[side] }}
                className={clsx(
                  'min-w-0 truncate px-1.5 pb-1 pt-1.5',
                  TEXT[side],
                  i === 0 && 'rounded-tl-md',
                  i === sides.length - 1 && 'rounded-tr-md',
                  side === far &&
                    i > 0 &&
                    'border-ink-400 border-l border-dashed'
                )}
                title={outcomeOf(side)}
              >
                <span className="font-semibold tabular-nums">
                  {formatOdds(sideTotal(bars, side))}
                </span>
                {side !== 'tie' && (
                  <>
                    {' '}
                    {/* A region of a few bars only fits the short name. */}
                    <span className={clsx('hidden', n >= 4 && 'sm:inline')}>
                      {outcomeOf(side)}
                    </span>
                    <span className={clsx(n >= 4 && 'sm:hidden')}>
                      {side} majority
                    </span>
                  </>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex h-32 sm:h-40">
          {bars.map((b, i) => {
            const active = b.id === shown.id
            const lead = b === mostLikely || b === winner
            return (
              <button
                key={b.id}
                type="button"
                className={clsx(
                  'focus-visible:ring-primary-500 relative flex h-full min-w-0 flex-1 items-end px-[2px] outline-none focus-visible:ring-2 sm:px-1',
                  tradable ? 'cursor-pointer' : 'cursor-default',
                  i === lineAt &&
                    i > 0 &&
                    'border-ink-400 border-l border-dashed'
                )}
                style={{ backgroundColor: TINT[b.side] }}
                aria-label={[
                  `${b.text} ${party} seats, ${formatOdds(b.p)}`,
                  outcomeOf(b.side),
                  moved(b) && `${formatOdds(b.dayAgo ?? 0)} 24 hours ago`,
                  tradable && 'bet on it',
                ]
                  .filter(Boolean)
                  .join(', ')}
                aria-haspopup={tradable ? 'dialog' : undefined}
                aria-disabled={!tradable}
                onMouseEnter={() => setActiveId(b.id)}
                onFocus={() => setActiveId(b.id)}
                onBlur={() => setActiveId(undefined)}
                onClick={() => bet(b)}
              >
                <span
                  className="relative block w-full transition-[height] duration-700 ease-out motion-reduce:transition-none"
                  style={{ height: height(b.p) }}
                >
                  <span
                    className="absolute inset-0 rounded-t-[3px] transition-opacity"
                    style={{
                      backgroundColor: FILL[b.side],
                      opacity: active || lead ? 1 : 0.7,
                    }}
                  />
                </span>
                {moved(b) && (
                  <span
                    aria-hidden
                    className="border-ink-500 pointer-events-none absolute bottom-0 left-[2px] right-[2px] rounded-t-[3px] border border-b-0 border-dashed transition-[height] duration-700 ease-out motion-reduce:transition-none sm:left-1 sm:right-1"
                    style={{ height: height(b.dayAgo ?? 0) }}
                  />
                )}
                {/* Above the bar or its 24h outline, whichever is taller. */}
                <span
                  className={clsx(
                    'absolute left-1/2 -translate-x-1/2 whitespace-nowrap pb-0.5 text-[10px] tabular-nums transition-[bottom] duration-700 ease-out motion-reduce:transition-none sm:text-[11px]',
                    active || lead
                      ? 'text-ink-900 font-semibold'
                      : 'text-ink-600',
                    b.p < 0.05 && !active && 'hidden sm:block'
                  )}
                  style={{
                    bottom: height(
                      moved(b) ? Math.max(b.p, b.dayAgo ?? 0) : b.p
                    ),
                  }}
                >
                  {formatOdds(b.p)}
                </span>
              </button>
            )
          })}
        </div>

        <div className="border-ink-300 flex border-t">
          {bars.map((b) => (
            <span
              key={b.id}
              aria-hidden
              className={clsx(
                'min-w-0 flex-1 truncate pt-1 text-center text-[10px] tabular-nums',
                // House ranges ("193–202") need the small size to fit.
                !longLabels && 'sm:text-xs',
                b.id === shown.id
                  ? 'text-ink-900 font-semibold'
                  : 'text-ink-600'
              )}
            >
              {b.label}
            </span>
          ))}
        </div>
      </div>

      <div className="text-ink-600 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] sm:text-xs">
        {anyMoved && (
          <span className="flex items-center gap-1">
            <span className="border-ink-500 inline-block h-2.5 w-2.5 rounded-sm border border-dashed" />
            24 hours ago
          </span>
        )}
        <span>{chamber.rule}</span>
        {tradable && <span className="sm:ml-auto">Pick a bar to bet</span>}
      </div>
      {dialog}
    </div>
  )
}

// The range being read: the hovered bar, else the final or likeliest one.
function Readout(props: {
  bar: Bar
  view: Party
  caption?: string
  showChange: boolean
}) {
  const { bar, view, caption, showChange } = props
  const change =
    showChange && bar.dayAgo !== undefined ? (bar.p - bar.dayAgo) * 100 : 0
  return (
    <div className="mt-2 flex items-center gap-2">
      <Image
        src={
          view === 'D'
            ? '/politics-party/democrat_symbol.png'
            : '/politics-party/republican_symbol.png'
        }
        alt=""
        width={28}
        height={28}
        className="h-6 w-6 object-contain sm:h-7 sm:w-7"
      />
      <div className="flex min-w-0 flex-col">
        <div className="flex items-baseline gap-1.5">
          <strong
            className={clsx(
              'text-2xl font-bold tabular-nums leading-none sm:text-3xl',
              TEXT[bar.side]
            )}
          >
            {bar.label}
          </strong>
          <span className="text-ink-600 text-sm">seats</span>
        </div>
        <span className="text-ink-600 truncate text-xs">
          {[caption, outcomeOf(bar.side)].filter(Boolean).join(' · ')}
        </span>
      </div>
      <div className="ml-auto flex shrink-0 flex-col items-end">
        <span className="text-ink-900 text-lg font-semibold tabular-nums leading-tight sm:text-xl">
          {formatOdds(bar.p)}
        </span>
        {Math.abs(change) >= 0.5 ? (
          <span
            className={clsx(
              'text-xs tabular-nums',
              change > 0 ? 'text-teal-600' : 'text-scarlet-600'
            )}
          >
            {change > 0 ? '▲' : '▼'} {Math.abs(change).toFixed(1)} pts in 24h
          </span>
        ) : (
          <span className="text-ink-600 text-xs">chance</span>
        )}
      </div>
    </div>
  )
}
