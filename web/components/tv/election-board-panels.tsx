import clsx from 'clsx'
import { ReactNode, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ChevronDownIcon,
  ExternalLinkIcon,
  HeartIcon as OutlineHeartIcon,
  LocationMarkerIcon,
} from '@heroicons/react/outline'
import { HeartIcon } from '@heroicons/react/solid'

import { contractPath, isMultiCpmm } from 'common/contract'
import { formatMoney } from 'common/util/format'
import { fromNow } from 'client-common/lib/time'
import { useDisplayUserById } from 'web/hooks/use-user-supabase'
import { Avatar } from 'web/components/widgets/avatar'
import {
  DistrictOutcomes,
  RaceOutcomes,
} from 'web/components/usa-map/race-outcome-rows'
import {
  electionOdds,
  outcomeLabel,
} from 'web/components/usa-map/election-map-model'
import { BallotMeasureCard } from 'web/components/usa-map/ballot-measure-card'
import { approvalChance } from 'web/components/usa-map/ballot-measures-model'
import { ControlCard } from 'web/components/usa-map/control-card'
import { modeName } from 'web/components/usa-map/chamber-tabs'
import { formatOdds } from 'web/components/usa-map/election-display'
import mapStyles from 'web/components/usa-map/election-explorer.module.css'
import {
  BoardMarket,
  BoardPosition,
  BoardRace,
  BoardTrade,
  isBoardRace,
  leaderText,
  likeableContractId,
  outcomeTone,
  RaceCall,
  RaceMove,
  Watchlist,
} from './election-board-model'
import { leadingParty } from 'web/components/usa-map/election-map-model'

export type BoardTab = 'map' | 'movers' | 'close' | 'watch' | 'trades'

export const BOARD_TABS: { id: BoardTab; label: string }[] = [
  { id: 'map', label: 'Map' },
  { id: 'movers', label: 'Movers' },
  { id: 'close', label: 'Toss-ups' },
  { id: 'watch', label: 'Watchlist' },
  { id: 'trades', label: 'Trades' },
]

// Tone colors for text, from the map's palette (the CSS module adapts them
// for dark mode under its layout scope).
const toneText = (tone?: string) =>
  tone === 'dem'
    ? 'text-azure-700 dark:text-azure-400'
    : tone === 'rep'
    ? 'text-sienna-700 dark:text-sienna-400'
    : tone === 'other'
    ? 'text-teal-700 dark:text-teal-400'
    : 'text-ink-700'

// A brief highlight when a value changes while the viewer is watching, so a
// live tick catches the eye.
export function useFlash(value: number | string | undefined) {
  const [flash, setFlash] = useState<'up' | 'down'>()
  const previous = useRef(value)
  useEffect(() => {
    const before = previous.current
    previous.current = value
    if (before === undefined || value === undefined || before === value) return
    setFlash(
      typeof value === 'number' && typeof before === 'number' && value < before
        ? 'down'
        : 'up'
    )
    const timeout = setTimeout(() => setFlash(undefined), 1500)
    return () => clearTimeout(timeout)
  }, [value])
  return flash
}

export function BoardTabs(props: {
  tabs: { id: BoardTab; label: string }[]
  tab: BoardTab
  onTab: (tab: BoardTab) => void
  counts?: Partial<Record<BoardTab, number>>
  className?: string
}) {
  const { tabs, tab, onTab, counts, className } = props
  return (
    <div
      role="tablist"
      className={clsx(
        'bg-canvas-50 flex gap-1 overflow-x-auto rounded-lg p-1 text-sm',
        className
      )}
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={tab === t.id}
          onClick={() => onTab(t.id)}
          className={clsx(
            'flex shrink-0 grow items-center justify-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1.5 font-medium transition-colors',
            tab === t.id
              ? 'bg-canvas-0 text-primary-700 shadow-sm'
              : 'text-ink-600 hover:text-ink-900'
          )}
        >
          {t.label}
          {!!counts?.[t.id] && (
            <span className="bg-ink-200 text-ink-700 rounded-full px-1.5 text-[11px] leading-4">
              {counts[t.id]}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

// Market likes (the account's hearts, as on market pages), by market id.
export type BoardLikes = {
  liked: Set<string>
  disabled: (contractId: string) => boolean
  toggle: (contractId: string) => void
}

type RowActions = {
  likes: BoardLikes
  onShowOnMap: (race: BoardRace) => void
}

type RowData = {
  race: BoardRace
  move?: RaceMove
  called?: RaceCall
  position?: BoardPosition
}

// One race: its quote, an optional 24h move or the account's position, a
// heart for its market, and when opened the map's own outcome rows with
// their Bet buttons.
export function BoardRaceRow(props: RowActions & RowData) {
  const { race, move, called, position, likes, onShowOnMap } = props
  const [open, setOpen] = useState(false)
  const leader = leadingParty(race.odds)
  const quote = leaderText(race)
  const flash = useFlash(quote)

  return (
    <li
      className={clsx(
        'border-ink-100 border-b transition-colors duration-700 last:border-b-0',
        flash && 'bg-primary-100/60 dark:bg-primary-900/40'
      )}
    >
      <div className="flex items-center gap-1.5 py-2 pr-1">
        <LikeHeart
          contractId={likeableContractId(race)}
          label={race.label}
          likes={likes}
        />
        <button
          className="flex min-w-0 grow items-center gap-2 text-left"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <span className="min-w-0 grow">
            <span className="text-ink-900 block truncate text-sm font-medium">
              {race.label}
            </span>
            <span className="text-ink-500 block truncate text-xs">
              {called
                ? `Called ${called.time ? fromNow(called.time) : ''}`
                : race.matchup ??
                  race.candidates?.map((c) => c.name).join(' · ') ??
                  modeName(race.mode)}
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end">
            <span
              className={clsx(
                'text-sm font-semibold tabular-nums',
                toneText(outcomeTone(leader))
              )}
            >
              {called && leader ? `${outcomeLabel(leader)} won` : quote}
            </span>
            {move && (
              <span
                className={clsx(
                  'text-xs font-medium tabular-nums',
                  toneText(outcomeTone(move.gainer))
                )}
              >
                {move.flipped ? 'Flipped · ' : ''}
                {outcomeLabel(move.gainer)} +{Math.round(move.gain * 100)}
              </span>
            )}
            {position && <PositionText position={position} />}
          </span>
          <ChevronDownIcon
            className={clsx(
              'text-ink-400 h-4 w-4 shrink-0 transition-transform',
              open && 'rotate-180'
            )}
          />
        </button>
      </div>
      {open && (
        <div className="pb-3 pl-8 pr-1">
          <RaceBetRows race={race} />
          <div className="mt-2 flex gap-3 text-xs">
            <button
              className="text-primary-700 flex items-center gap-1 hover:underline"
              onClick={() => onShowOnMap(race)}
            >
              <LocationMarkerIcon className="h-3.5 w-3.5" />
              Show on map
            </button>
            {race.contract && (
              <Link
                href={contractPath(race.contract)}
                target="_blank"
                className="text-primary-700 flex items-center gap-1 hover:underline"
              >
                <ExternalLinkIcon className="h-3.5 w-3.5" />
                Market
              </Link>
            )}
          </div>
        </div>
      )}
    </li>
  )
}

// The heart on a market, as on market pages. A district priced by a
// portfolio market has no market of its own to like: the rows stay aligned.
function LikeHeart(props: {
  contractId: string | undefined
  label: string
  likes: BoardLikes
}) {
  const { contractId, label, likes } = props
  if (!contractId) return <span className="w-6 shrink-0" />
  const liked = likes.liked.has(contractId)
  return (
    <button
      className={clsx(
        'hover:text-primary-600 shrink-0 p-1 disabled:opacity-50',
        liked ? 'text-primary-600' : 'text-ink-400'
      )}
      aria-label={`${liked ? 'Unlike' : 'Like'} ${label} market`}
      title={liked ? 'Unlike' : 'Like'}
      aria-pressed={liked}
      disabled={likes.disabled(contractId)}
      onClick={() => likes.toggle(contractId)}
    >
      {liked ? (
        <HeartIcon className="h-4 w-4" aria-hidden />
      ) : (
        <OutlineHeartIcon className="h-4 w-4" aria-hidden />
      )}
    </button>
  )
}

// A board market that is not a race: chamber control or a ballot measure,
// opening into the map's own control card or measure card.
function BoardMarketRow(
  props: RowActions & { market: BoardMarket; position?: BoardPosition }
) {
  const { market, position, likes } = props
  const [open, setOpen] = useState(false)
  const quote = marketQuote(market)
  const flash = useFlash(quote.text)
  return (
    <li
      className={clsx(
        'border-ink-100 border-b transition-colors duration-700 last:border-b-0',
        flash && 'bg-primary-100/60 dark:bg-primary-900/40'
      )}
    >
      <div className="flex items-center gap-1.5 py-2 pr-1">
        <LikeHeart
          contractId={likeableContractId(market)}
          label={market.label}
          likes={likes}
        />
        <button
          className="flex min-w-0 grow items-center gap-2 text-left"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <span className="min-w-0 grow">
            <span className="text-ink-900 block truncate text-sm font-medium">
              {market.label}
            </span>
            <span className="text-ink-500 block truncate text-xs">
              {market.detail}
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end">
            <span
              className={clsx(
                'text-sm font-semibold tabular-nums',
                toneText(quote.tone)
              )}
            >
              {quote.text}
            </span>
            {position && <PositionText position={position} />}
          </span>
          <ChevronDownIcon
            className={clsx(
              'text-ink-400 h-4 w-4 shrink-0 transition-transform',
              open && 'rotate-180'
            )}
          />
        </button>
      </div>
      {open && (
        <div className="pb-3 pl-8 pr-1">
          <div className={clsx(mapStyles.layout, 'z-0')}>
            {market.measure ? (
              <BallotMeasureCard
                measure={market.measure}
                contract={market.contract}
              />
            ) : market.chamber ? (
              <ControlCard label={market.chamber} contract={market.contract} />
            ) : null}
          </div>
          <Link
            href={contractPath(market.contract)}
            target="_blank"
            className="text-primary-700 mt-2 flex items-center gap-1 text-xs hover:underline"
          >
            <ExternalLinkIcon className="h-3.5 w-3.5" />
            Market
          </Link>
        </div>
      )}
    </li>
  )
}

// "R 62%" for chamber control; "Pass 58%" or "Fail 70%" for a measure.
function marketQuote(market: BoardMarket): { text: string; tone?: string } {
  if (market.measure) {
    const chance = approvalChance(market.measure, market.contract)
    if (chance === undefined) return { text: 'No odds' }
    return chance >= 0.5
      ? { text: `Pass ${formatOdds(chance)}`, tone: 'other' }
      : { text: `Fail ${formatOdds(1 - chance)}` }
  }
  const odds = electionOdds(market.contract, true)
  if (!odds) return { text: 'No odds' }
  return odds.rep > odds.dem
    ? { text: `R ${formatOdds(odds.rep)}`, tone: 'rep' }
    : { text: `D ${formatOdds(odds.dem)}`, tone: 'dem' }
}

// The map's outcome rows (party, candidate, chance, Bet), inside the map's
// CSS scope so they keep its colors in both themes.
function RaceBetRows(props: { race: BoardRace }) {
  const { race } = props
  const { contract, answerId } = race
  if (!contract) return null
  const portfolio =
    answerId &&
    isMultiCpmm(contract) &&
    contract.outcomeType === 'MULTIPLE_CHOICE'
      ? contract
      : undefined
  const answer = portfolio?.answers.find((a) => a.id === answerId)
  return (
    <div className={clsx(mapStyles.layout, 'z-0')}>
      {portfolio && answer ? (
        <DistrictOutcomes contract={portfolio} answer={answer} race={race} />
      ) : (
        <RaceOutcomes contract={contract} race={race} mode={race.mode} />
      )}
    </div>
  )
}

// The account's stake: its current value and profit, or the profit on a
// position it has sold out of.
function PositionText(props: { position: BoardPosition }) {
  const { hasShares, payout, profit } = props.position
  const rounded = Math.round(profit)
  return (
    <span className="text-xs tabular-nums">
      <span className="text-ink-600">
        {hasShares ? formatMoney(payout) : 'Sold'}
      </span>{' '}
      <span
        className={clsx(
          rounded > 0
            ? 'text-teal-600'
            : rounded < 0
            ? 'text-scarlet-600'
            : 'text-ink-500'
        )}
      >
        {rounded > 0 ? '+' : rounded < 0 ? '−' : '±'}
        {formatMoney(Math.abs(rounded))}
      </span>
    </span>
  )
}

function RaceList(
  props: RowActions & {
    rows: RowData[]
    empty: ReactNode
  }
) {
  const { rows, empty, ...actions } = props
  if (rows.length === 0)
    return <p className="text-ink-500 px-2 py-6 text-center text-sm">{empty}</p>
  return (
    <ul>
      {rows.map((row) => (
        <BoardRaceRow key={row.race.key} {...row} {...actions} />
      ))}
    </ul>
  )
}

function SectionLabel(props: { children: ReactNode }) {
  return (
    <div className="text-ink-500 px-1 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide first:pt-1">
      {props.children}
    </div>
  )
}

export function MoversPanel(
  props: RowActions & { moves: RaceMove[]; calls: RaceCall[] }
) {
  const { moves, calls, ...actions } = props
  return (
    <>
      {calls.length > 0 && (
        <>
          <SectionLabel>Latest calls</SectionLabel>
          <RaceList
            rows={calls.slice(0, 8).map((c) => ({ race: c.race, called: c }))}
            empty={null}
            {...actions}
          />
        </>
      )}
      <SectionLabel>Biggest moves · 24h</SectionLabel>
      <RaceList
        rows={moves.slice(0, 30).map((m) => ({ race: m.race, move: m }))}
        empty="No race has moved a point in the last day."
        {...actions}
      />
    </>
  )
}

export function CloseRacesPanel(props: RowActions & { races: BoardRace[] }) {
  const { races, ...actions } = props
  return (
    <>
      <SectionLabel>Closest races</SectionLabel>
      <RaceList
        rows={races.map((race) => ({ race }))}
        empty="No open race is close."
        {...actions}
      />
    </>
  )
}

// The board's markets the account has traded on or liked: races, chamber
// control and ballot measures.
export function WatchlistPanel(
  props: RowActions & {
    list: Watchlist<BoardRace | BoardMarket>
    signedIn: boolean | undefined
  }
) {
  const { list, signedIn, ...actions } = props
  if (signedIn === false)
    return (
      <p className="text-ink-500 px-2 py-6 text-center text-sm">
        Sign in to see the election markets you’ve traded on or liked.
      </p>
    )
  const row = (item: BoardRace | BoardMarket, position?: BoardPosition) =>
    isBoardRace(item) ? (
      <BoardRaceRow
        key={item.key}
        race={item}
        position={position}
        {...actions}
      />
    ) : (
      <BoardMarketRow
        key={item.key}
        market={item}
        position={position}
        {...actions}
      />
    )
  return (
    <>
      <SectionLabel>Your positions</SectionLabel>
      {list.traded.length === 0 ? (
        <p className="text-ink-500 px-2 py-4 text-center text-sm">
          Election markets you trade on show up here.
        </p>
      ) : (
        <ul>{list.traded.map((t) => row(t.item, t.position))}</ul>
      )}
      <SectionLabel>Liked</SectionLabel>
      {list.liked.length === 0 ? (
        <p className="text-ink-500 px-2 py-4 text-center text-sm">
          Tap ♡ on a race to like its market and keep it here.
        </p>
      ) : (
        <ul>{list.liked.map((item) => row(item))}</ul>
      )}
    </>
  )
}

export function TradesPanel(props: {
  trades: BoardTrade[]
  onShowRace: (raceKey: string) => void
}) {
  const { trades, onShowRace } = props
  return (
    <>
      <SectionLabel>Live trades</SectionLabel>
      {trades.length === 0 ? (
        <p className="text-ink-500 px-2 py-6 text-center text-sm">
          Trades on election markets appear here as they happen.
        </p>
      ) : (
        <ul>
          {trades.map((trade) => (
            <TradeRow
              key={trade.bet.id}
              trade={trade}
              onShowRace={onShowRace}
            />
          ))}
        </ul>
      )}
    </>
  )
}

const WHALE = 500

// A trade's effect on its side's chance, in points: "+1.4", "−0.2", "±0".
const formatPoints = (delta: number) => {
  const points = Math.round(delta * 1000) / 10
  if (!Number.isFinite(points) || points === 0) return '±0'
  return `${points > 0 ? '+' : '−'}${Math.abs(points).toFixed(1)}`
}

function TradeRow(props: {
  trade: BoardTrade
  onShowRace: (raceKey: string) => void
}) {
  const { trade, onShowRace } = props
  const { bet, target, side, tone, from, to, sold } = trade
  const user = useDisplayUserById(bet.userId)
  const raceKey = target.raceKey
  return (
    <li
      className={clsx(
        'border-ink-100 flex items-start gap-2 border-b px-1 py-2 text-sm last:border-b-0',
        Math.abs(bet.amount) >= WHALE && 'bg-amber-50 dark:bg-amber-900/20'
      )}
    >
      <Avatar
        size="xs"
        avatarUrl={user?.avatarUrl}
        username={user?.username}
        className="mt-0.5"
      />
      <div className="min-w-0 grow">
        <div className="truncate">
          <span className="font-medium">{user?.name ?? '…'}</span>{' '}
          <span className="text-ink-600">{sold ? 'sold' : 'bet'}</span>{' '}
          <span className="font-semibold tabular-nums">
            {formatMoney(Math.abs(bet.amount))}
          </span>{' '}
          <span className={clsx('font-semibold', toneText(tone))}>{side}</span>
        </div>
        <div className="text-ink-500 flex items-center gap-1 truncate text-xs">
          {raceKey ? (
            <button
              className="truncate hover:underline"
              onClick={() => onShowRace(raceKey)}
            >
              {target.label}
            </button>
          ) : (
            <span className="truncate">{target.label}</span>
          )}
          <span>·</span>
          <span className="shrink-0">{fromNow(bet.createdTime)}</span>
        </div>
      </div>
      <span className="flex shrink-0 flex-col items-end text-xs tabular-nums">
        <span className="text-ink-700 font-medium">{formatOdds(to)}</span>
        <span className="text-ink-500">{formatPoints(to - from)}</span>
      </span>
    </li>
  )
}
