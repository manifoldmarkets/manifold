import clsx from 'clsx'
import dayjs from 'dayjs'
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Router from 'next/router'

import { Bet } from 'common/bet'
import { Contract } from 'common/contract'
import { TRADE_TERM } from 'common/envs/constants'
import { TV_ELECTION_BOARD_ID } from 'common/tv'
import { useApiSubscription } from 'client-common/hooks/use-api-subscription'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { SEO } from 'web/components/SEO'
import { Button } from 'web/components/buttons/button'
import { Page } from 'web/components/layout/page'
import { ModActionBadge } from 'web/components/moderation/mod-action'
import { useAdminOrMod } from 'web/hooks/use-admin'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'
import { track } from 'web/lib/service/analytics'
import type { ElectionMapProps } from 'web/lib/politics/home'
import {
  LiveElectionContracts,
  LiveElectionExplorer,
  useLiveElectionMap,
} from 'web/components/usa-map/live-election-map'
import { ExplorerFocus } from 'web/components/usa-map/election-explorer'
import { ControlBetDialog } from 'web/components/usa-map/control-card'
import { electionOdds } from 'web/components/usa-map/election-map-model'
import { formatOdds } from 'web/components/usa-map/election-display'
import { DEM_COLOR, REP_COLOR } from 'web/components/usa-map/state-election-map'
import { FloatingChat } from './floating-chat'
import { ScheduleTVModal } from './schedule-tv-modal'
import { ScheduleItem } from './tv-schedule'
import { TVStreamPlayer } from './tv-stream'
import {
  biggestMovers,
  BoardRace,
  boardRaces,
  boardRacesADayAgo,
  BoardTrade,
  boardTrades,
  closestRaces,
  latestCalls,
  MIN_TRADE,
  TradeTarget,
  tradeTargets,
} from './election-board-model'
import {
  BOARD_TABS,
  BoardTab,
  BoardTabs,
  CloseRacesPanel,
  MoversPanel,
  TradesPanel,
  useFlash,
  WatchlistPanel,
} from './election-board-panels'

// Manifold TV with "election" as its market: the stream, both chambers'
// control markets, the races moving right now, and the full /election map
// with its search, all live and all tradable in place. Chat floats in a
// bubble so the stream and the markets get the width.
export function TVElectionDisplay(props: {
  stream: ScheduleItem
  electionMap: ElectionMapProps | null
}) {
  const { stream, electionMap } = props
  const user = useUser()
  const isMod = useAdminOrMod()
  const isStreamCreator = user?.id === stream.creator_id
  const [showSettings, setShowSettings] = useState(false)
  const [raceOpen, setRaceOpen] = useState(false)
  const channelId = `tv-${stream.id}`
  const live =
    dayjs().isAfter(stream.start_time) && dayjs().isBefore(stream.end_time)

  return (
    // No Google One Tap: on phones its sheet covers the chat bubble and the
    // map, as on /election.
    <Page
      trackPageView="tv election page"
      className="!mt-0 xl:col-span-10 xl:pr-0"
      hideGoogleOneTap
    >
      <SEO
        title={`${stream.title} on Manifold TV`}
        description={`Watch the stream and ${TRADE_TERM} on every race on the live election map`}
        url={`/tv/${stream.id}`}
      />
      {/* Phones pin the 16:9 stream to the top, so the map's sticky header
          sits below it. */}
      <div className="flex w-full flex-col [--explorer-sticky-top:56.25vw] md:[--explorer-sticky-top:0px]">
        {electionMap ? (
          <ElectionBoard
            stream={stream}
            electionMap={electionMap}
            onRaceOpen={setRaceOpen}
            header={
              <StreamHeader
                stream={stream}
                live={live}
                canModify={isStreamCreator || isMod}
                isStreamCreator={isStreamCreator}
                onModify={() => setShowSettings(true)}
              />
            }
          />
        ) : (
          <>
            <TVStreamPlayer stream={stream} />
            <StreamHeader
              stream={stream}
              live={live}
              canModify={isStreamCreator || isMod}
              isStreamCreator={isStreamCreator}
              onModify={() => setShowSettings(true)}
            />
            <MapLoading />
          </>
        )}
      </div>
      <ScheduleTVModal
        open={showSettings}
        setOpen={() => setShowSettings(false)}
        stream={stream}
        slug={TV_ELECTION_BOARD_ID}
      />
      <FloatingChat channelId={channelId} makeRoom={raceOpen} />
    </Page>
  )
}

const RETRY_MS = 15_000
const MAX_RETRIES = 8

// The page was built before this stream became the board (it switches live
// with the schedule), so its props have no map yet. Refetch them until the
// next build has the map: props update in place, without a reload.
function MapLoading() {
  const [tries, setTries] = useState(0)
  useEffect(() => {
    if (tries >= MAX_RETRIES) return
    const timeout = setTimeout(() => {
      Router.replace(Router.asPath, undefined, { scroll: false })
        .catch(() => false)
        .finally(() => setTries((t) => t + 1))
    }, RETRY_MS)
    return () => clearTimeout(timeout)
  }, [tries])
  return (
    <p className="text-ink-600 px-4 py-8 text-center">
      {tries < MAX_RETRIES
        ? 'Loading the live election map…'
        : 'The live election map is unavailable right now.'}{' '}
      <Link href="/election" className="text-primary-700 underline">
        Open the election page
      </Link>
    </p>
  )
}

function StreamHeader(props: {
  stream: ScheduleItem
  live: boolean
  canModify: boolean
  isStreamCreator: boolean
  onModify: () => void
}) {
  const { stream, live, canModify, isStreamCreator, onModify } = props
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 sm:px-4 sm:py-3">
      <div className="flex min-w-0 items-center gap-2">
        {live && (
          <span className="flex shrink-0 items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            Live
          </span>
        )}
        <h1 className="text-ink-1000 truncate text-lg font-semibold sm:text-xl">
          {stream.title}
        </h1>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {canModify && (
          <Button
            size="xs"
            color={isStreamCreator ? 'indigo-outline' : 'purple-outline'}
            onClick={onModify}
          >
            {!isStreamCreator && <ModActionBadge className="mr-1" />}
            Modify
          </Button>
        )}
        <Button
          size="xs"
          color="gray-outline"
          onClick={() => Router.push('/tv/schedule')}
        >
          Schedule
        </Button>
        <Link
          href="/election"
          target="_blank"
          className="text-primary-700 hidden text-sm hover:underline sm:inline"
        >
          Election page ↗
        </Link>
      </div>
    </div>
  )
}

// Recomputing every race on every tick is wasted work on a busy night: take
// the latest value at most once per `ms`.
function useThrottled<T>(value: T, ms: number) {
  const [throttled, setThrottled] = useState(value)
  const last = useRef(0)
  useEffect(() => {
    const wait = Math.max(0, last.current + ms - Date.now())
    const timeout = setTimeout(() => {
      last.current = Date.now()
      setThrottled(value)
    }, wait)
    return () => clearTimeout(timeout)
  }, [value, ms])
  return throttled
}

function ElectionBoard(props: {
  stream: ScheduleItem
  electionMap: ElectionMapProps
  header: ReactNode
  onRaceOpen: (open: boolean) => void
}) {
  const { stream, electionMap, header, onRaceOpen } = props
  const { subscriptions, live } = useLiveElectionMap(electionMap)
  // A day ago, from the page's own snapshot, where each price and its
  // probChanges were read together (see pricedADayAgo). Live prices are
  // then compared against it.
  const dayAgo = useMemo(
    () =>
      boardRacesADayAgo({
        senate: electionMap.rawSenateStateContracts,
        governor: electionMap.rawGovernorStateContracts,
        house: electionMap.houseDistrictsContract,
        additionalHouse: electionMap.additionalHouseContracts,
      }),
    [electionMap]
  )
  const board = useThrottled(live, 2000)

  const races = useMemo(() => boardRaces(board), [board])
  const moves = useMemo(() => biggestMovers(races, dayAgo), [races, dayAgo])
  const calls = useMemo(() => latestCalls(races), [races])
  const close = useMemo(() => closestRaces(races), [races])
  const raceByKey = useMemo(
    () => new Map(races.map((r) => [r.key, r])),
    [races]
  )

  const [starredKeys, setStarredKeys] = usePersistentLocalState<string[]>(
    [],
    'tv-election-watchlist'
  )
  const starred = useMemo(() => new Set(starredKeys), [starredKeys])
  const onStar = (key: string) => {
    const next = starred.has(key)
      ? starredKeys.filter((k) => k !== key)
      : [...starredKeys, key]
    setStarredKeys(next)
    track('tv election star race', { race: key, starred: !starred.has(key) })
  }

  const trades = useBoardTrades(races, board)

  // Phones and tablets get one tab strip with the map in it; from xl the
  // lists sit beside the stream and the map spans the page below.
  const [tab, setTab] = usePersistentInMemoryState<BoardTab>(
    'map',
    `tv-election-tab-${stream.id}`
  )
  // Below xl the map shares the tab strip; behind another tab it is hidden,
  // and so must be its race panel. While that panel is a bottom sheet
  // (phones), the chat bubble steps aside.
  const narrow = useIsMobile(1280)
  const mapHidden = narrow && tab !== 'map'
  const [mapRace, setMapRace] = useState<string>()
  const sheetOpen = !!mapRace && !mapHidden
  useEffect(() => onRaceOpen(sheetOpen), [sheetOpen])
  const [railTab, setRailTab] = usePersistentInMemoryState<BoardTab>(
    'movers',
    `tv-election-rail-tab-${stream.id}`
  )
  const [focus, setFocus] = useState<ExplorerFocus>()
  const mapRef = useRef<HTMLDivElement>(null)
  const onShowOnMap = (race: BoardRace) => {
    setTab('map')
    setFocus({ mode: race.mode, race: race.id, key: Date.now() })
    track('tv election show race on map', { race: race.key })
    // The explorer scrolls itself into view on phones; do it on wide screens.
    if (window.innerWidth > 850)
      requestAnimationFrame(() =>
        mapRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      )
  }
  const onShowRace = (key: string) => {
    const race = raceByKey.get(key)
    if (race) onShowOnMap(race)
  }

  const actions = { starred, onStar, onShowOnMap }
  const panel = (t: BoardTab) =>
    t === 'movers' ? (
      <MoversPanel moves={moves} calls={calls} {...actions} />
    ) : t === 'close' ? (
      <CloseRacesPanel races={close} {...actions} />
    ) : t === 'watch' ? (
      <WatchlistPanel races={races} {...actions} />
    ) : t === 'trades' ? (
      <TradesPanel trades={trades} onShowRace={onShowRace} />
    ) : null
  const counts = { watch: starredKeys.length }

  return (
    <>
      {subscriptions}
      {/* Below xl these wrappers are `contents`, so the phone's sticky
          stream stays pinned for the whole page, not just this block. */}
      <div className="contents xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] xl:gap-4 xl:px-2 xl:pt-2">
        <div className="contents xl:flex xl:flex-col">
          <TVStreamPlayer stream={stream} className="xl:rounded-lg" />
          {header}
          <ControlStrip
            senate={board.senateControl}
            house={board.houseControl}
            className="px-3 sm:px-4 xl:px-0"
          />
        </div>
        <aside className="border-ink-200 bg-canvas-0 relative isolate hidden min-h-[480px] rounded-lg border xl:block">
          <div className="absolute inset-0 flex flex-col">
            <BoardTabs
              tabs={BOARD_TABS.filter((t) => t.id !== 'map')}
              tab={railTab}
              onTab={setRailTab}
              counts={counts}
              className="m-2"
            />
            <div className="min-h-0 grow overflow-y-auto px-2 pb-2">
              {panel(railTab)}
            </div>
          </div>
        </aside>
      </div>

      <BoardTabs
        tabs={BOARD_TABS}
        tab={tab}
        onTab={(t) => {
          setTab(t)
          track('tv election tab', { tab: t })
        }}
        counts={counts}
        className="mx-3 mt-3 sm:mx-4 xl:hidden"
      />
      {tab !== 'map' && (
        <div className="isolate mx-3 mt-1 min-h-[50vh] pb-24 sm:mx-4 xl:hidden">
          {panel(tab)}
        </div>
      )}

      {/* One explorer for every layout, hidden (not unmounted) behind the
          other tabs so its zoom and selection survive. */}
      <div
        ref={mapRef}
        className={clsx(
          'mt-3 scroll-mt-2 px-1 pb-24 sm:px-2 xl:mt-6',
          tab !== 'map' && 'max-xl:hidden'
        )}
      >
        <LiveElectionExplorer
          live={live}
          linkedMarketCounts={electionMap.linkedMarketCounts}
          focus={focus}
          hideControls
          onSelect={setMapRace}
          hideDetails={mapHidden}
        />
      </div>
    </>
  )
}

// Both chambers at a glance, each a tap from a bet.
function ControlStrip(props: {
  senate: Contract | null
  house: Contract | null
  className?: string
}) {
  const { senate, house, className } = props
  if (!senate && !house) return null
  return (
    <div className={clsx('grid grid-cols-2 gap-2', className)}>
      <ControlChip label="Senate" contract={senate} />
      <ControlChip label="House" contract={house} />
    </div>
  )
}

function ControlChip(props: { label: string; contract: Contract | null }) {
  const { label, contract } = props
  const [outcome, setOutcome] = useState<'YES' | 'NO'>()
  const odds = electionOdds(contract, true)
  const flash = useFlash(odds?.rep)
  if (!contract || !odds) return null
  const rep = odds.rep > odds.dem
  const tradable =
    !contract.isResolved &&
    (contract.closeTime == null || contract.closeTime > Date.now())
  return (
    <div
      className={clsx(
        'border-ink-200 bg-canvas-0 rounded-lg border p-2 transition-colors duration-700 sm:p-3',
        flash === 'up' && 'bg-sienna-100/60 dark:bg-sienna-900/30',
        flash === 'down' && 'bg-azure-100/60 dark:bg-azure-900/30'
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-ink-600 text-xs font-medium uppercase tracking-wide">
          {label}
        </span>
        <span
          className={clsx(
            'text-lg font-bold tabular-nums sm:text-xl',
            rep
              ? 'text-sienna-700 dark:text-sienna-400'
              : 'text-azure-700 dark:text-azure-400'
          )}
        >
          {rep ? 'R' : 'D'} {formatOdds(rep ? odds.rep : odds.dem)}
        </span>
      </div>
      <div className="bg-ink-100 my-1.5 flex h-1.5 overflow-hidden rounded-full">
        <i style={{ width: `${odds.dem * 100}%`, background: DEM_COLOR }} />
        <i style={{ width: `${odds.rep * 100}%`, background: REP_COLOR }} />
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <button
          disabled={!tradable}
          onClick={() => setOutcome('NO')}
          className="border-azure-300 text-azure-700 hover:bg-azure-50 dark:text-azure-300 dark:hover:bg-azure-900/40 rounded-md border py-1 text-xs font-semibold disabled:opacity-50"
        >
          Dem {formatOdds(odds.dem)}
        </button>
        <button
          disabled={!tradable}
          onClick={() => setOutcome('YES')}
          className="border-sienna-300 text-sienna-700 hover:bg-sienna-50 dark:text-sienna-300 dark:hover:bg-sienna-900/40 rounded-md border py-1 text-xs font-semibold disabled:opacity-50"
        >
          Rep {formatOdds(odds.rep)}
        </button>
      </div>
      {outcome && (
        <ControlBetDialog
          label={label}
          contract={contract}
          outcome={outcome}
          onClose={() => setOutcome(undefined)}
          trackingLocation="tv election control"
        />
      )}
    </div>
  )
}

const SEED_TRADES = 40
const MAX_TRADES = 60

// Big-enough trades on the board's markets: the latest few on the busiest
// races when the page opens, then live from the global bet stream.
function useBoardTrades(races: BoardRace[], board: LiveElectionContracts) {
  const targets = useMemo(
    () =>
      tradeTargets(races, {
        senate: board.senateControl,
        house: board.houseControl,
      }),
    [races, board.senateControl, board.houseControl]
  )
  const targetsRef = useRef<Map<string, TradeTarget>>(targets)
  targetsRef.current = targets
  const [trades, setTrades] = useState<BoardTrade[]>([])
  const add = (next: BoardTrade[]) =>
    setTrades((old) => {
      const seen = new Set(old.map((t) => t.bet.id))
      return [...next.filter((t) => !seen.has(t.bet.id)), ...old]
        .sort((a, b) => b.bet.createdTime - a.bet.createdTime)
        .slice(0, MAX_TRADES)
    })

  // Seed from the control markets and the closest races: a short id list
  // keeps the request small, and these are where the action is.
  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current || races.length === 0) return
    seeded.current = true
    const ids = [
      board.senateControl?.id,
      board.houseControl?.id,
      ...closestRaces(races, 40).map((r) => r.contract?.id),
    ].filter((id): id is string => !!id)
    api('bets', {
      contractId: [...new Set(ids)],
      minAmount: MIN_TRADE,
      filterRedemptions: true,
      order: 'desc',
      limit: SEED_TRADES,
    })
      .then((bets) => add(boardTrades(bets, targetsRef.current)))
      .catch((e) => console.error('Seeding TV trades failed', e))
  }, [races.length])

  useApiSubscription({
    topics: ['global/new-bet'],
    onBroadcast: (msg) => {
      const next = boardTrades(
        (msg.data.bets ?? []) as Bet[],
        targetsRef.current
      )
      if (next.length) add(next)
    },
  })

  return trades
}
