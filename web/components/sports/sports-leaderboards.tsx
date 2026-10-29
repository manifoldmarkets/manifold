import { useEffect, useState } from 'react'
import { fromNow } from 'client-common/lib/time'
import { SportsLeaderboardEntry } from 'common/sports-leaderboards'
import { SportInfo } from 'common/sports-schedule'
import { HOUR_MS, MINUTE_MS } from 'common/util/time'
import { Col } from 'web/components/layout/col'
import { LeaderboardColumn } from 'web/components/leaderboard'
import {
  CREATOR_COLUMNS,
  LeaderboardPanel,
  PROFIT_COLUMNS,
} from 'web/components/topics/topic-leaderboard'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useIsClient } from 'web/hooks/use-is-client'
import { useUser } from 'web/hooks/use-user'

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
  // hidden tab stays mounted. So whenever the board is over an hour old (or
  // not built yet), fetch again, then keep checking every ten minutes.
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 10 * MINUTE_MS)
    return () => clearInterval(id)
  }, [])
  const updatedTime = data?.updatedTime
  useEffect(() => {
    if (updatedTime === undefined || loading) return
    if (updatedTime === null || Date.now() - updatedTime > HOUR_MS) refresh()
  }, [updatedTime, tick])
  // Keyed by sport where it's used, and each sport has its own cache slot,
  // so data is always this sport's.
  const built = !!data && data.updatedTime !== null
  const notYet = !!data && data.updatedTime === null
  const emptyText = (none: string) =>
    error
      ? "Couldn't load the leaderboard."
      : notYet
      ? 'The first leaderboard is on its way. Check back within the hour.'
      : none

  return (
    <Col className="gap-4">
      <BoardPanel
        title="Top traders"
        entries={built ? data?.profit : undefined}
        loading={loading}
        columns={PROFIT_COLUMNS}
        highlightUserId={user?.id}
        emptyText={emptyText(`No ${label} traders yet.`)}
      />
      <BoardPanel
        title="Top creators"
        entries={built ? data?.creator : undefined}
        loading={loading}
        columns={CREATOR_COLUMNS}
        highlightUserId={user?.id}
        emptyText={emptyText(`No ${label} creators yet.`)}
      />
      <p className="text-ink-400 px-1 text-xs">
        Traders by profit on every {label} market, all time. Creators by the
        traders on their {label} markets; official game markets don't count.
        Updated hourly
        {built && data?.updatedTime && isClient
          ? `, last ${fromNow(data.updatedTime)}`
          : ''}
        .
      </p>
    </Col>
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
