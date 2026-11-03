import clsx from 'clsx'
import { ReactNode, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ChevronDownIcon,
  ExternalLinkIcon,
  LocationMarkerIcon,
  SearchIcon,
} from '@heroicons/react/outline'
import { StarIcon as StarOutlineIcon } from '@heroicons/react/outline'
import { StarIcon } from '@heroicons/react/solid'

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
  matchesRaceQuery,
  outcomeLabel,
} from 'web/components/usa-map/election-map-model'
import { modeName } from 'web/components/usa-map/chamber-tabs'
import { formatOdds } from 'web/components/usa-map/election-display'
import mapStyles from 'web/components/usa-map/election-explorer.module.css'
import {
  BoardRace,
  BoardTrade,
  leaderText,
  outcomeTone,
  RaceCall,
  RaceMove,
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

type RowActions = {
  starred: Set<string>
  onStar: (key: string) => void
  onShowOnMap: (race: BoardRace) => void
}

// One race: its quote, an optional 24h move, a star, and when opened the
// map's own outcome rows with their Bet buttons.
export function BoardRaceRow(
  props: RowActions & { race: BoardRace; move?: RaceMove; called?: RaceCall }
) {
  const { race, move, called, starred, onStar, onShowOnMap } = props
  const [open, setOpen] = useState(false)
  const leader = leadingParty(race.odds)
  const quote = leaderText(race)
  const flash = useFlash(quote)
  const isStarred = starred.has(race.key)

  return (
    <li
      className={clsx(
        'border-ink-100 border-b transition-colors duration-700 last:border-b-0',
        flash && 'bg-primary-100/60 dark:bg-primary-900/40'
      )}
    >
      <div className="flex items-center gap-1.5 py-2 pr-1">
        <button
          className="text-ink-400 shrink-0 p-1 hover:text-amber-500"
          aria-label={isStarred ? `Unstar ${race.label}` : `Star ${race.label}`}
          aria-pressed={isStarred}
          onClick={() => onStar(race.key)}
        >
          {isStarred ? (
            <StarIcon className="h-4 w-4 text-amber-500" />
          ) : (
            <StarOutlineIcon className="h-4 w-4" />
          )}
        </button>
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

function RaceList(
  props: RowActions & {
    rows: { race: BoardRace; move?: RaceMove; called?: RaceCall }[]
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

export function WatchlistPanel(props: RowActions & { races: BoardRace[] }) {
  const { races, starred, ...actions } = props
  const [query, setQuery] = useState('')
  const watched = races.filter((r) => starred.has(r.key))
  const results = query.trim()
    ? races.filter((r) => r.contract && matchesRaceQuery(r, query)).slice(0, 8)
    : []
  return (
    <>
      <label className="border-ink-200 bg-canvas-0 focus-within:ring-primary-500 mx-1 mt-1 flex items-center gap-2 rounded-lg border px-2 py-1.5 focus-within:ring-2">
        <SearchIcon className="text-ink-400 h-4 w-4 shrink-0" />
        <input
          className="placeholder:text-ink-400 min-w-0 grow border-none bg-transparent p-0 text-sm focus:ring-0"
          placeholder="Add a race: PA, Ohio, AZ-6…"
          aria-label="Find a race to add"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {query.trim() && (
        <>
          <SectionLabel>Results</SectionLabel>
          <RaceList
            rows={results.map((race) => ({ race }))}
            empty="No race matches."
            starred={starred}
            {...actions}
          />
        </>
      )}
      <SectionLabel>Your races</SectionLabel>
      <RaceList
        rows={watched.map((race) => ({ race }))}
        empty="Star a race to follow it here."
        starred={starred}
        {...actions}
      />
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
