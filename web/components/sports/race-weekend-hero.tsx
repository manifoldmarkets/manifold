import { ChevronRightIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import dayjs from 'dayjs'
import { sortBy, uniqBy } from 'lodash'
import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'
import { GiCheckeredFlag, GiF1Car, GiLaurelsTrophy } from 'react-icons/gi'
import { Contract, CPMMMultiContract, isMultiCpmm } from 'common/contract'
import {
  buildDriverBoard,
  DriverBoardCell,
  DriverBoardMarket,
  DriverBoardRow,
  raceDisplayName,
  RaceSessionEvent,
  raceSessionEvent,
  raceWeekendMarkets,
  topRaceMarket,
} from 'common/race-weekends'
import { readableTextColor } from 'common/sports-team-colors'
import { GameLinkedMarkets } from 'web/components/sports/game-related-markets'
import { useProbFlash } from 'web/components/sports/game-row'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import {
  OnBet,
  raceSessionAnchor,
  relatedHost,
  SessionControls,
  sessionTitle,
  useDriverBet,
} from './race-session-card'
import { sportPath } from './sport-rail'
import { SportsMarketBadge } from './sports-market-badge'

type Choice = ReturnType<typeof raceWeekendMarkets>[number]

/** Drivers the timing tower lists before "All 22 drivers". */
const TOWER_ROWS = 8
/** ...and when it's stacked under the grid or podium. */
const TOWER_ROWS_STACKED = 6
/** How often the featured weekend re-reads its prices. */
const REFRESH_MS = 45_000

/** Qualifying lines up as a grid; a winner or podium market on a podium. */
const viewFor = (c: Choice) =>
  c.market.marketType === 'podium'
    ? 'podium'
    : c.session.label === 'Qualifying'
    ? 'grid'
    : 'winner'

/** A price column's heading: "Pole", "Sprint", "Win", "Podium". */
const columnLabel = (c: Choice) =>
  c.market.marketType === 'podium'
    ? 'Podium'
    : c.session.label === 'Qualifying'
    ? 'Pole'
    : c.session.label === 'Sprint'
    ? 'Sprint'
    : 'Win'

/** Open by the schedule; the loaded market has the last word (boardMarket). */
const scheduledOpen = (c: Choice) =>
  !c.market.isResolved && c.session.status !== 'finished'

/**
 * The tower's price columns: the picked market, then the weekend's other open
 * markets a fan would bet next, the race winner first.
 */
function towerColumns(
  choices: Choice[],
  picked: Choice,
  isOpen: (c: Choice) => boolean
): Choice[] {
  const raceWin = choices.find(
    (c) => c.session.label === 'Race' && c.market.marketType === 'winner'
  )
  const podium = choices.find((c) => c.market.marketType === 'podium')
  const next = picked === raceWin ? podium : raceWin
  const rest = [next, ...choices].filter(
    (c): c is Choice => !!c && c !== picked && isOpen(c)
  )
  return [picked, ...uniqBy(rest, (c) => c.market.id)].slice(0, 3)
}

/** The weekend's market as the board reads it: the full field once loaded. */
function boardMarket(
  c: Choice,
  contracts: Contract[] | undefined
): DriverBoardMarket {
  const closed = !scheduledOpen(c)
  const contract = contracts?.find((x) => x.id === c.market.id)
  if (contract && isMultiCpmm(contract)) {
    const multi = contract as CPMMMultiContract
    return {
      id: c.market.id,
      closed:
        closed ||
        !!multi.resolution ||
        (!!multi.closeTime && multi.closeTime <= Date.now()),
      resolution: multi.resolution ?? undefined,
      answers: multi.answers,
    }
  }
  // Until the markets load, the leaders the schedule sent.
  return {
    id: c.market.id,
    closed,
    answers: c.market.leaders.map((l) => ({
      id: l.answerId,
      text: l.name,
      shortText: l.shortName,
      prob: l.prob,
      color: l.color,
      resolution: l.won ? 'YES' : undefined,
    })),
  }
}

/**
 * The featured F1 weekend, as a fan would want it: the Grand Prix and the
 * clock to the next session, a pill per market, the market's favourites on a
 * starting grid (pole) or a podium (winner, podium), and every driver on a
 * timing tower with a price for each of the weekend's open markets, so the
 * next bet is one tap from the last. The markets people made about the
 * session follow.
 */
export function RaceWeekendHero(props: {
  event: RaceSessionEvent
  /**
   * The front page's, to save room: the clock, the pills and the picked
   * market's grid or podium, from the schedule. The timing tower and the
   * day's moves are on the F1 page, a link away.
   */
  compact?: boolean
}) {
  const { event, compact = false } = props
  const { weekend } = event
  const choices = raceWeekendMarkets(weekend)
  const [pickedId, setPickedId] = useState<string>()
  const boardId = useId()
  const ids = choices.map((c) => c.market.id)
  const markets = useAPIGetter(
    'markets-by-ids',
    { ids },
    undefined,
    `f1-weekend-${ids.join(',')}`,
    !compact && ids.length > 0
  )
  // Compact reads only the schedule: what an earlier visit to the F1 page
  // loaded is kept in memory, and would be older.
  const loaded = compact ? undefined : markets.data
  // Prices move while the page is open: re-read them now and then, and after
  // a bet.
  const refresh = useRef(markets.refresh)
  refresh.current = markets.refresh
  useEffect(() => {
    if (compact) return
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh.current()
    }, REFRESH_MS)
    return () => clearInterval(timer)
  }, [compact])
  // Compact updates with the schedule, like the game cards around it.
  const bet = useDriverBet(
    compact ? 'sports f1 featured compact' : 'sports f1 featured',
    compact ? undefined : () => void refresh.current()
  )

  // Opens on the session's most traded market, the one it was featured for.
  const top = topRaceMarket(event.session)
  const picked =
    choices.find((c) => c.market.id === pickedId) ??
    choices.find((c) => c.market.id === top?.id) ??
    choices.find((c) => c.session.sessionId === event.session.sessionId) ??
    choices[0]
  if (!picked) return null
  const shown = raceSessionEvent(weekend, picked.session)
  const host = relatedHost(shown)
  const name = raceDisplayName(weekend.name)
  const boards = choices.map((c) => boardMarket(c, loaded))
  const rows = buildDriverBoard(boards, picked.market.id)
  // Open by the loaded markets: one that closed early or settled takes no
  // column or mover from one still open (F4213-17).
  const openIds = new Set(boards.filter((m) => !m.closed).map((m) => m.id))
  const isOpen = (c: Choice) => openIds.has(c.market.id)
  const columns = towerColumns(choices, picked, isOpen)
  const view = viewFor(picked)
  const lead = rows.filter((r) => !r.other && r.cells[picked.market.id])
  // The result from every row: "Another driver" can win too (F4213-18).
  const winners = rows.filter((r) => r.cells[picked.market.id]?.won)
  const settled =
    picked.market.isResolved ||
    !!loaded?.find((c) => c.id === picked.market.id)?.isResolved

  const header = (
    <div className="relative isolate min-w-0 px-4 pb-3 pt-3 sm:px-5">
      <GiF1Car
        aria-hidden
        className="text-primary-600/10 pointer-events-none absolute -right-4 -top-3 -z-10 h-32 w-32 sm:h-40 sm:w-40"
      />
      <div className="flex items-center gap-2">
        <SportsMarketBadge market={picked.market} />
        <span className="text-primary-700 truncate text-[10px] font-bold uppercase tracking-wider">
          Featured · Formula 1
        </span>
        <div className="ml-auto">
          <SessionControls
            volume={picked.market.volume ?? 0}
            traders={picked.market.uniqueBettorCount ?? 0}
            market={picked.market}
            title={`${name} ${picked.label.toLowerCase()}`}
          />
        </div>
      </div>
      <h3 className="text-ink-1000 mt-1 text-2xl font-black uppercase italic leading-none tracking-tight [text-wrap:balance] sm:text-3xl">
        {name}
      </h3>
      <SessionClock
        choice={picked}
        winners={winners}
        settled={settled}
        className="mt-2"
      />
      {choices.length > 1 && (
        <div
          role="group"
          aria-label={`${name} markets`}
          className="mt-3 flex flex-wrap gap-1.5"
        >
          {choices.map((c) => (
            <MarketPill
              key={c.market.id}
              choice={c}
              selected={c.market.id === picked.market.id}
              controls={boardId}
              onPick={() => setPickedId(c.market.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
  const board =
    view === 'grid' ? (
      <StartingGrid rows={lead} marketId={picked.market.id} onBet={bet.open} />
    ) : (
      <PodiumStand
        rows={lead}
        marketId={picked.market.id}
        mode={view}
        onBet={bet.open}
      />
    )

  return (
    <section
      id={raceSessionAnchor(event.id)}
      aria-label={`${name}, featured`}
      className="border-primary-200 bg-primary-50 scroll-mt-32 overflow-hidden rounded-2xl border"
    >
      <CheckeredStrip />
      {compact ? (
        // Side by side once there's room, as tall as a featured game.
        <div className="@container/board">
          <div className="@[40rem]/board:grid-cols-2 @[40rem]/board:items-center grid">
            {header}
            <div
              id={boardId}
              className="@[40rem]/board:pt-3 min-w-0 px-3 pb-2 sm:px-4"
            >
              {board}
              <Link
                href={sportPath('f1')}
                className="text-primary-700 hover:bg-primary-100 focus-visible:ring-primary-500 mt-1 flex min-h-[44px] items-center justify-center gap-1 rounded-lg text-sm font-semibold transition-colors focus-visible:ring-2"
              >
                Every driver, every market
                <ChevronRightIcon className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <>
          {header}
          <div id={boardId} className="@container/board px-3 pb-4 sm:px-4">
            <div className="@[40rem]/board:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] @[40rem]/board:items-start grid gap-3">
              <div className="flex min-w-0 flex-col gap-3">
                {board}
                <Movers
                  rows={rows}
                  choices={choices.filter(isOpen)}
                  onBet={bet.open}
                />
              </div>
              {/* Remounted once the full field loads, so the switch from the
                  schedule's leaders doesn't flash every price as a move. */}
              <TimingTower
                key={loaded ? 'loaded' : 'seed'}
                rows={rows}
                columns={columns}
                loading={!loaded && !markets.error}
                onBet={bet.open}
              />
            </div>
          </div>
        </>
      )}
      {host && (
        // Keyed by session, so switching to one with props opens them; on
        // the front page they start closed, as under a featured game.
        <GameLinkedMarkets
          key={host.id}
          game={host}
          label={sessionTitle(shown)}
          defaultExpanded={!compact && host.related.length > 0}
        />
      )}
      {bet.dialog}
    </section>
  )
}

/** A strip of chequered flag along the top of the card. */
function CheckeredStrip() {
  return (
    <div
      aria-hidden
      className="h-2 w-full opacity-80"
      style={{
        backgroundImage: 'repeating-conic-gradient(#111 0% 25%, #fff 0% 50%)',
        backgroundSize: '8px 8px',
      }}
    />
  )
}

/**
 * "Lights out in 1d 04h 12m", "Live", or how it finished. The status follows
 * the ticking clock, not just the schedule's last read, so the start and the
 * close show on time (F4213-19); a settled market is over whatever the time.
 */
function SessionClock(props: {
  choice: Choice
  /** The picked market's winners, "Another driver" included. */
  winners: DriverBoardRow[]
  settled: boolean
  className?: string
}) {
  const { choice, winners, settled, className } = props
  const { session } = choice
  const now = useNow(1000)
  const when = dayjs(session.startTime).format('ddd D MMM · h:mm A')
  const phase =
    settled || session.status === 'finished' || now >= session.closeTime
      ? 'finished'
      : session.status === 'live' || now >= session.startTime
      ? 'live'
      : 'upcoming'
  let status: React.ReactNode
  if (phase === 'live') {
    status = (
      <span className="bg-scarlet-500 inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-black uppercase italic tracking-wide text-white">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
        Live
      </span>
    )
  } else if (phase === 'finished') {
    // One winner by name; a podium's three by code; a settled market with
    // none (cancelled) is just final.
    const result =
      winners.length === 1
        ? winners[0].other
          ? winners[0].name
          : `${winners[0].code} ${winners[0].shortName}`
        : winners.length > 1
        ? winners.map((w) => w.code || w.name).join(' · ')
        : settled
        ? 'Final'
        : 'Awaiting result'
    status = (
      <span className="bg-ink-900 text-canvas-0 inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-black uppercase italic tracking-wide">
        <GiCheckeredFlag className="h-3.5 w-3.5" aria-hidden />
        {result}
      </span>
    )
  } else {
    const left = session.startTime - now
    status = (
      <span className="bg-ink-900 text-canvas-0 inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide">
        {session.label === 'Race' ? 'Lights out' : 'Starts'}
        <span className="font-mono tabular-nums">in {countdown(left)}</span>
      </span>
    )
  }
  return (
    <div
      className={clsx(
        'text-ink-600 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs',
        className
      )}
    >
      <span className="text-ink-900 font-semibold">{session.label}</span>
      <span>{when}</span>
      {status}
    </div>
  )
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

/** "1d 04h 12m" a day or more out, else "04:12:33". */
function countdown(ms: number) {
  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return d > 0
    ? `${d}d ${pad(h)}h ${pad(m)}m`
    : `${pad(h)}:${pad(m)}:${pad(s % 60)}`
}

function MarketPill(props: {
  choice: Choice
  selected: boolean
  controls: string
  onPick: () => void
}) {
  const { choice, selected, controls, onPick } = props
  const { session } = choice
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-controls={controls}
      onClick={onPick}
      className={clsx(
        'focus-visible:ring-primary-500 flex min-h-[44px] flex-col items-start justify-center rounded-lg border px-3 py-1 text-left transition-colors focus-visible:ring-2',
        selected
          ? 'border-ink-900 bg-ink-900 text-canvas-0'
          : 'border-ink-200 bg-canvas-0 text-ink-800 hover:border-primary-300'
      )}
    >
      <span className="flex items-center gap-1.5 text-xs font-black uppercase italic tracking-wide">
        {session.status === 'live' && (
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
        )}
        {choice.label}
        {session.status === 'finished' && (
          <span aria-label=", finished">✓</span>
        )}
      </span>
      <span
        className={clsx(
          'text-[10px]',
          selected ? 'text-canvas-0/70' : 'text-ink-500'
        )}
      >
        {session.status === 'live'
          ? 'In progress'
          : dayjs(session.startTime).format('ddd h:mm A')}
      </span>
    </button>
  )
}

/** A driver as on the timing screens: their code on their team's colour. */
function DriverBadge(props: { row: DriverBoardRow; size: 'sm' | 'lg' }) {
  const { row, size } = props
  const color = row.color ?? '#94A3B8'
  return (
    <span
      aria-hidden
      className={clsx(
        'flex shrink-0 items-center justify-center rounded-full font-black italic shadow-sm',
        size === 'lg' ? 'h-11 w-11 text-sm' : 'h-7 w-7 text-[10px]'
      )}
      style={{ backgroundColor: color, color: readableTextColor(color) }}
    >
      {row.code}
    </span>
  )
}

const pct = (p: number) => `${Math.round(p * 100)}%`

/**
 * The front of the grid: pole's six favourites in grid order, in painted grid
 * boxes on the asphalt (dark in either theme, like the real thing).
 */
function StartingGrid(props: {
  rows: DriverBoardRow[]
  marketId: string
  onBet: OnBet
}) {
  const { rows, marketId, onBet } = props
  const front = rows.slice(0, 6)
  return (
    <figure className="min-w-0">
      <div className="rounded-xl bg-neutral-900 px-3 pb-10 pt-3 shadow-inner">
        <div className="grid grid-cols-2 gap-x-4">
          {front.map((row, i) => {
            const cell = row.cells[marketId] as DriverBoardCell
            return (
              <button
                key={row.name}
                type="button"
                disabled={cell.closed}
                onClick={() => onBet(marketId, cell.answerId)}
                aria-label={`${row.name}: ${
                  cell.won ? 'took pole' : `${pct(cell.prob)} chance of pole`
                }`}
                className={clsx(
                  // Two lines, so a box as narrow as a 320px phone's still
                  // fits the code beside its price (F4213-16).
                  'group mb-2 flex min-h-[50px] min-w-0 flex-col gap-0.5 rounded-sm border-l-2 border-t-2 border-white/70 px-2 py-1.5 text-left transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-amber-300 disabled:cursor-default',
                  i % 2 === 1 && 'translate-y-8',
                  cell.won && 'ring-2 ring-teal-400'
                )}
              >
                <span className="flex items-baseline justify-between gap-1">
                  <span className="text-[10px] font-black italic text-white/50">
                    P{i + 1}
                    {i === 0 && (
                      <span className="ml-1 not-italic text-amber-300">
                        POLE
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-sm font-black tabular-nums text-teal-300 group-hover:text-white">
                    {cell.won ? '✓' : pct(cell.prob)}
                  </span>
                </span>
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    aria-hidden
                    className="h-4 w-1 shrink-0 rounded-full bg-white/40"
                    style={
                      row.color ? { backgroundColor: row.color } : undefined
                    }
                  />
                  <span className="shrink-0 text-sm font-black italic text-white">
                    {row.code}
                  </span>
                  <span className="min-w-0 truncate text-[10px] text-white/60">
                    {row.shortName}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
      <figcaption className="text-ink-500 mt-2 text-center text-[11px]">
        Chance of pole, the grid as the market sees it. Tap a driver to trade.
      </figcaption>
    </figure>
  )
}

/**
 * The biggest moves of the day across the weekend's open markets, each a tap
 * from a bet: a trader's reason to look at the race winner while browsing
 * qualifying.
 */
function Movers(props: {
  rows: DriverBoardRow[]
  choices: Choice[]
  onBet: OnBet
}) {
  const { rows, choices, onBet } = props
  const moves = rows.flatMap((row) =>
    row.other
      ? []
      : choices.flatMap((choice) => {
          const cell = row.cells[choice.market.id]
          return cell && Math.abs(cell.dayChange) >= 3
            ? [{ row, choice, cell }]
            : []
        })
  )
  const top = sortBy(moves, (m) => -Math.abs(m.cell.dayChange)).slice(0, 3)
  if (top.length === 0) return null
  return (
    <div className="bg-canvas-0 border-ink-200 rounded-xl border px-3 py-2">
      <div className="text-ink-500 text-[10px] font-black uppercase italic tracking-wider">
        On the move today
      </div>
      <ul className="mt-1">
        {top.map(({ row, choice, cell }) => (
          <li
            key={`${choice.market.id}-${cell.answerId}`}
            className="flex min-h-[36px] items-center gap-2"
          >
            <span
              aria-hidden
              className="bg-ink-300 h-5 w-1 shrink-0 rounded-full"
              style={row.color ? { backgroundColor: row.color } : undefined}
            />
            <span className="text-ink-1000 w-8 shrink-0 text-xs font-black">
              {row.code}
            </span>
            <span className="text-ink-600 min-w-0 flex-1 truncate text-xs">
              {columnLabel(choice)}
            </span>
            <Move change={cell.dayChange} />
            <span className="w-14 shrink-0">
              <TowerPrice
                cell={cell}
                primary
                label={`${row.name}, ${columnLabel(choice).toLowerCase()}`}
                onBet={(answerId) => onBet(choice.market.id, answerId)}
              />
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const STEP_HEIGHT = { 1: 'h-16', 2: 'h-11', 3: 'h-8' } as const
const MEDAL = {
  1: 'from-amber-300 to-amber-500 text-amber-950',
  2: 'from-slate-200 to-slate-400 text-slate-800',
  3: 'from-orange-300 to-orange-500 text-orange-950',
} as const

/**
 * The three favourites on a podium. For a winner market only the top step is
 * lit: second and third don't pay there.
 */
function PodiumStand(props: {
  rows: DriverBoardRow[]
  marketId: string
  mode: 'winner' | 'podium'
  onBet: OnBet
}) {
  const { rows, marketId, mode, onBet } = props
  const top = rows.slice(0, 3)
  return (
    <figure className="min-w-0">
      <div className="mx-auto grid max-w-sm grid-cols-3 items-end gap-1.5">
        {([1, 0, 2] as const).map((i) => {
          const row = top[i]
          if (!row) return <div key={i} />
          const place = (i + 1) as 1 | 2 | 3
          const cell = row.cells[marketId] as DriverBoardCell
          const lit = mode === 'podium' || place === 1
          return (
            <div key={row.name} className="flex min-w-0 flex-col">
              <button
                type="button"
                disabled={cell.closed}
                onClick={() => onBet(marketId, cell.answerId)}
                aria-label={`${row.name}: ${
                  cell.won
                    ? mode === 'podium'
                      ? 'on the podium'
                      : 'won'
                    : `${pct(cell.prob)} chance to ${
                        mode === 'podium' ? 'finish top three' : 'win'
                      }`
                }`}
                className="focus-visible:ring-primary-500 group flex min-w-0 flex-col items-center gap-1 rounded-t-lg px-1 pb-1.5 pt-1 text-center focus-visible:ring-2 disabled:cursor-default"
              >
                {place === 1 && (
                  <GiLaurelsTrophy
                    aria-hidden
                    className="h-5 w-5 text-amber-500"
                  />
                )}
                <DriverBadge row={row} size="lg" />
                <span className="text-ink-800 w-full truncate text-[11px] font-semibold">
                  {row.shortName}
                </span>
                <span
                  className={clsx(
                    'rounded-md px-2 py-0.5 text-sm font-black tabular-nums shadow-sm transition-colors',
                    cell.won
                      ? 'bg-teal-500 text-white'
                      : 'bg-canvas-0 group-disabled:group-hover:bg-canvas-0 text-teal-700 group-hover:bg-teal-500 group-hover:text-white group-disabled:group-hover:text-teal-700'
                  )}
                >
                  {cell.won ? '✓' : pct(cell.prob)}
                </span>
              </button>
              <div
                className={clsx(
                  'flex justify-center rounded-t-md bg-gradient-to-b pt-0.5 text-lg font-black italic',
                  STEP_HEIGHT[place],
                  lit ? MEDAL[place] : 'from-ink-200 to-ink-300 text-ink-500'
                )}
              >
                {place}
              </div>
            </div>
          )
        })}
      </div>
      <figcaption className="text-ink-500 mt-2 text-center text-[11px]">
        {mode === 'podium'
          ? 'Chance to finish top three: any podium place pays.'
          : 'Chance to win: only the winner pays.'}{' '}
        Tap a driver to trade.
      </figcaption>
    </figure>
  )
}

/**
 * Every driver, in the picked market's order, with a price per open market of
 * the weekend: the picked one first. The third column shows once there's
 * room.
 */
function TimingTower(props: {
  rows: DriverBoardRow[]
  columns: Choice[]
  loading: boolean
  onBet: OnBet
}) {
  const { rows, columns, loading, onBet } = props
  const [all, setAll] = useState(false)
  const listed = rows.filter((r) => columns.some((c) => r.cells[c.market.id]))
  const shown = all ? listed : listed.slice(0, TOWER_ROWS)
  const grid =
    columns.length >= 3
      ? 'grid-cols-[1.5rem_minmax(0,1fr)_3.5rem_3.5rem] @[30rem]:grid-cols-[1.5rem_minmax(0,1fr)_3.5rem_3.5rem_3.5rem]'
      : columns.length === 2
      ? 'grid-cols-[1.5rem_minmax(0,1fr)_3.5rem_3.5rem]'
      : 'grid-cols-[1.5rem_minmax(0,1fr)_3.5rem]'
  return (
    <div
      role="table"
      aria-label="Timing tower"
      className="@container bg-canvas-0 border-ink-200 min-w-0 overflow-hidden rounded-xl border"
    >
      <div
        role="row"
        className={clsx(
          'bg-ink-900 text-canvas-0 grid items-center gap-x-1.5 px-2 py-1.5 text-[10px] font-black uppercase italic tracking-wider',
          grid
        )}
      >
        <span role="columnheader" className="text-center">
          P
        </span>
        <span role="columnheader">Driver</span>
        {columns.map((c, i) => (
          <span
            key={c.market.id}
            role="columnheader"
            className={clsx('text-center', i === 2 && '@[30rem]:block hidden')}
          >
            {columnLabel(c)}
          </span>
        ))}
      </div>
      {shown.map((row, i) => (
        <div
          key={row.name}
          role="row"
          className={clsx(
            'border-ink-100 items-center gap-x-1.5 border-t px-2 py-1',
            grid,
            // Stacked under the grid or podium (a phone), six rows are enough
            // before "All drivers"; beside it, eight fill the height.
            !all && i >= TOWER_ROWS_STACKED
              ? '@[40rem]/board:grid hidden'
              : 'grid'
          )}
        >
          <span
            role="cell"
            className="text-ink-900 text-center text-xs font-black italic tabular-nums"
          >
            {row.other ? '' : i + 1}
          </span>
          <span role="cell" className="flex min-w-0 items-center gap-1.5">
            <span
              aria-hidden
              className="bg-ink-300 h-5 w-1 shrink-0 rounded-full"
              style={row.color ? { backgroundColor: row.color } : undefined}
            />
            {!row.other && (
              <span className="text-ink-1000 w-8 shrink-0 text-xs font-black">
                {row.code}
              </span>
            )}
            <span className="text-ink-600 min-w-0 truncate text-xs">
              {row.other ? row.name : row.shortName}
            </span>
            <Move change={row.cells[columns[0].market.id]?.dayChange} />
          </span>
          {columns.map((c, ci) => (
            <span
              key={c.market.id}
              role="cell"
              className={clsx(ci === 2 && '@[30rem]:block hidden')}
            >
              <TowerPrice
                cell={row.cells[c.market.id]}
                primary={ci === 0}
                label={`${row.name}, ${columnLabel(c).toLowerCase()}`}
                onBet={(answerId) => onBet(c.market.id, answerId)}
              />
            </span>
          ))}
        </div>
      ))}
      {loading &&
        Array.from({ length: Math.max(0, TOWER_ROWS - shown.length) }).map(
          (_, i) => (
            <div
              key={i}
              aria-hidden
              className="border-ink-100 flex h-[37px] animate-pulse items-center gap-2 border-t px-2"
            >
              <div className="bg-ink-100 h-3 w-full rounded" />
            </div>
          )
        )}
      {listed.length > TOWER_ROWS_STACKED && (
        <button
          type="button"
          onClick={() => setAll((value) => !value)}
          className={clsx(
            'text-primary-700 hover:bg-canvas-50 border-ink-100 w-full border-t py-2 text-xs font-semibold',
            // Beside the grid, eight rows may be all there are.
            listed.length <= TOWER_ROWS && '@[40rem]/board:hidden'
          )}
        >
          {all ? 'Fewer drivers' : `All ${listed.length} drivers`}
        </button>
      )}
    </div>
  )
}

/** The price's move over the day, when it's a point or more. */
function Move(props: { change: number | undefined }) {
  const { change } = props
  if (!change || Math.abs(change) < 1) return null
  return (
    <span
      className={clsx(
        'shrink-0 text-[10px] font-bold tabular-nums',
        change > 0 ? 'text-teal-600' : 'text-scarlet-600'
      )}
      title="Change over the last day"
    >
      {change > 0 ? '▲' : '▼'}
      {Math.abs(change)}
    </span>
  )
}

/** A tower price: tap to buy YES on that driver in that market. */
function TowerPrice(props: {
  cell: DriverBoardCell | undefined
  primary: boolean
  label: string
  onBet: (answerId: string) => void
}) {
  const { cell, primary, label, onBet } = props
  const flash = useProbFlash(cell ? Math.round(cell.prob * 100) : -1)
  if (!cell) return <span className="text-ink-300 block text-center">–</span>
  return (
    <button
      type="button"
      disabled={cell.closed}
      onClick={() => onBet(cell.answerId)}
      aria-label={`${label}: ${cell.won ? 'won' : pct(cell.prob)}`}
      className={clsx(
        'focus-visible:ring-primary-500 h-8 w-full rounded-md text-xs font-bold tabular-nums transition-colors focus-visible:ring-2',
        flash === 'up' && '!bg-teal-500/40 !text-teal-700',
        flash === 'down' && '!bg-scarlet-500/30 !text-scarlet-700',
        cell.won
          ? 'bg-teal-500 text-white'
          : primary
          ? 'bg-teal-500/15 text-teal-700 hover:bg-teal-500 hover:text-white'
          : 'bg-canvas-50 text-ink-600 border-ink-200 border hover:bg-teal-500/20 hover:text-teal-700',
        cell.closed && !cell.won && 'cursor-default opacity-60'
      )}
    >
      {cell.won ? '✓' : pct(cell.prob)}
    </button>
  )
}
