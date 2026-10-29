import { ClockIcon, ExclamationIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { fromNow } from 'client-common/lib/time'
import { SportsLeaderboardEntry } from 'common/sports-leaderboards'
import { SportInfo } from 'common/sports-schedule'
import { MINUTE_MS } from 'common/util/time'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { LeaderboardColumn } from 'web/components/leaderboard'
import {
  CREATOR_COLUMNS,
  LeaderboardPanel,
  PROFIT_COLUMNS,
} from 'web/components/topics/topic-leaderboard'
import { DateTimeTooltip } from 'web/components/widgets/datetime-tooltip'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useIsClient } from 'web/hooks/use-is-client'
import { useUser } from 'web/hooks/use-user'
import {
  boardStatus,
  isDelayed,
  shouldRefresh,
} from './sports-leaderboards-state'

const SHOWN = 10

/**
 * The best traders on a sport's markets (every sport's, on /sports) and the
 * creators whose markets drew the most traders. The scheduler rebuilds both
 * hourly.
 */
export function SportsLeaderboards(props: { sport: SportInfo | 'all' }) {
  const { sport } = props
  const key = sport === 'all' ? 'all' : sport.key
  const label = sport === 'all' ? 'sports' : sport.label
  const user = useUser()
  const isClient = useIsClient()
  const { data, loading, error, refresh } = useAPIGetter(
    'sports-leaderboards',
    { sport: key },
    undefined,
    `sports-leaderboards-${key}`
  )
  // Rebuilds come hourly, but a response stays cached for the session and a
  // hidden tab stays mounted. So check whenever the board changes and every
  // ten minutes: see shouldRefresh.
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 10 * MINUTE_MS)
    return () => clearInterval(id)
  }, [])
  const updatedTime = data?.updatedTime
  useEffect(() => {
    if (shouldRefresh({ updatedTime, error, loading, tick, now: Date.now() }))
      refresh()
  }, [updatedTime, tick])
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  // Keyed by sport where it's used, and each sport has its own cache slot,
  // so data is always this sport's.
  const status = boardStatus(data, error, mounted)
  const built = status === 'built'
  // No boards means the hourly rebuild isn't running (its first run builds
  // them), so it reads as a failure.
  const emptyText = (none: string) =>
    status === 'failed' || status === 'notYet'
      ? "Couldn't load the leaderboard."
      : none

  return (
    <Col className="gap-4">
      {built && data?.updatedTime && isClient && (
        <BoardsUpdated updatedTime={data.updatedTime} />
      )}
      <BoardPanel
        title="Top traders"
        entries={built ? data?.profit : undefined}
        loading={status === 'loading'}
        columns={PROFIT_COLUMNS}
        highlightUserId={user?.id}
        emptyText={emptyText(`No ${label} traders yet.`)}
      />
      <BoardPanel
        title="Top creators"
        entries={built ? data?.creator : undefined}
        loading={status === 'loading'}
        columns={CREATOR_COLUMNS}
        highlightUserId={user?.id}
        emptyText={emptyText(`No ${label} creators yet.`)}
      />
      <p className="text-ink-400 px-1 text-xs">
        Traders by profit on every {label} market, all time. Creators by the
        traders on their {label} markets; official game markets don't count.
        Updated hourly.
      </p>
    </Col>
  )
}

// When the boards were last rebuilt, flagged once a rebuild is overdue. The
// page re-renders at least every ten minutes (the refresh check), which keeps
// this current.
function BoardsUpdated(props: { updatedTime: number }) {
  const { updatedTime } = props
  const delayed = isDelayed(updatedTime, Date.now())
  const Icon = delayed ? ExclamationIcon : ClockIcon
  return (
    <Row
      className={clsx(
        'items-start gap-1.5 px-1 text-xs',
        delayed ? 'text-amber-700 dark:text-amber-400' : 'text-ink-500'
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>
        {delayed ? 'Delayed: last updated ' : 'Updated '}
        <DateTimeTooltip time={updatedTime} className="inline">
          {fromNow(updatedTime)}
        </DateTimeTooltip>
        {delayed && '. They normally update every hour.'}
      </span>
    </Row>
  )
}

// The top ten, and the rest of the stored board on request.
function BoardPanel(props: {
  title: string
  entries: SportsLeaderboardEntry[] | undefined
  loading: boolean
  columns: LeaderboardColumn[]
  highlightUserId?: string
  emptyText: string
}) {
  const { entries, ...rest } = props
  const [expanded, setExpanded] = useState(false)
  const more = (entries?.length ?? 0) > SHOWN
  return (
    <LeaderboardPanel
      {...rest}
      // An empty board reads as the empty text, not a bare table.
      entries={
        entries && entries.length > 0
          ? expanded
            ? entries
            : entries.slice(0, SHOWN)
          : undefined
      }
      footer={
        more && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-primary-700 hover:bg-canvas-50 w-full rounded-md py-2 text-sm font-medium"
          >
            {expanded ? 'Show top 10' : `Show top ${entries?.length}`}
          </button>
        )
      }
    />
  )
}
