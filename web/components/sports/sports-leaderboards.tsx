import { ClockIcon, ExclamationIcon } from '@heroicons/react/outline'
import { ChevronRightIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import Link from 'next/link'
import { Fragment, useEffect, useState } from 'react'
import { fromNow } from 'client-common/lib/time'
import {
  SportsLeaderboardEntry,
  SportsLeaderboardPosition,
  topicBoardKey,
} from 'common/sports-leaderboards'
import {
  SportInfo,
  sportPath,
  SportsSubtopic,
  sportTopicPath,
} from 'common/sports-schedule'
import { buildArray } from 'common/util/array'
import { formatWithCommas } from 'common/util/format'
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
import DropdownMenu from 'web/components/widgets/dropdown-menu'
import { track } from 'web/lib/service/analytics'
import {
  boardScopeChildren,
  boardStatus,
  isDelayed,
  shouldRefresh,
} from './sports-leaderboards-state'
import { useSportsIndex } from './use-sports-index'

const SHOWN = 10

/**
 * The best traders on a sport's markets (every sport's, on /sports; a topic's
 * on its page) and the creators whose markets drew the most traders. The
 * scheduler rebuilds both hourly.
 */
export function SportsLeaderboards(props: {
  sport: SportInfo | 'all'
  /** A topic under the sport, for its page. */
  topic?: SportsSubtopic
}) {
  const { sport, topic } = props
  const key = topic
    ? topicBoardKey(topic.id)
    : sport === 'all'
    ? 'all'
    : sport.key
  const label = topic?.label ?? (sport === 'all' ? 'sports' : sport.label)
  const user = useUser()
  const isClient = useIsClient()
  // Signed in, the response also says where the visitor stands, so each
  // account has its own cache slot.
  const { data, loading, error, refresh } = useAPIGetter(
    'sports-leaderboards',
    { ...(topic ? { topic: topic.id } : { sport: key }), userId: user?.id },
    undefined,
    `sports-leaderboards-${key}-${user?.id ?? ''}`
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
  // Keyed by board where it's used, and each board has its own cache slot,
  // so data is always this board's.
  const status = boardStatus(data, error, mounted)
  const built = status === 'built'
  const emptyText = (none: string) =>
    status === 'failed'
      ? "Couldn't load the leaderboard."
      : status === 'notYet'
      ? 'The first leaderboard is on its way. Check back within the hour.'
      : none

  return (
    <Col className="gap-4">
      <BoardScopes sport={sport} topic={topic} />
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
        header={
          user &&
          built &&
          data?.you && (
            <YourPlace
              place={data.you.profit}
              columns={PROFIT_COLUMNS}
              userId={user.id}
              of="traders"
              none={`Trade ${label} markets to get on this board.`}
            />
          )
        }
      />
      <BoardPanel
        title="Top creators"
        entries={built ? data?.creator : undefined}
        loading={status === 'loading'}
        columns={CREATOR_COLUMNS}
        highlightUserId={user?.id}
        emptyText={emptyText(`No ${label} creators yet.`)}
        header={
          user &&
          built &&
          data?.you && (
            <YourPlace
              place={data.you.creator}
              columns={CREATOR_COLUMNS}
              userId={user.id}
              of="creators"
              none={`Make ${label} markets to get on this board.`}
            />
          )
        }
      />
      <p className="text-ink-400 px-1 text-xs">
        Traders by profit on every {label} market, all time. Creators by the
        traders on their {label} markets; official game markets don't count.
        Updated hourly.
      </p>
    </Col>
  )
}

// The boards above this one, All sports › Soccer › Premier League, each
// opening its page's Leaderboards tab; and an arrow after the last that lists
// the boards under it (boardScopeChildren).
function BoardScopes(props: {
  sport: SportInfo | 'all'
  topic?: SportsSubtopic
}) {
  const { sport, topic } = props
  const { index } = useSportsIndex()
  const children = index ? boardScopeChildren(sport, topic, index) : []
  const tab = '?tab=leaderboards'
  const scopes = buildArray(
    {
      label: 'All sports',
      href: sportPath('all') + tab,
      active: sport === 'all' && !topic,
    },
    sport !== 'all' && {
      label: sport.label,
      href: sportPath(sport.key) + tab,
      active: !topic,
    },
    topic && {
      label: topic.label,
      href: sportTopicPath(topic.sport, topic.slug) + tab,
      active: true,
    }
  )
  if (scopes.length < 2 && children.length === 0) return null
  const last = scopes[scopes.length - 1]
  const anyEmoji = children.some((c) => c.emoji)
  return (
    <nav aria-label="Leaderboard scope">
      <Row className="flex-wrap items-center gap-1 px-1 text-sm">
        {scopes.map((s, i) => (
          <Fragment key={s.href}>
            {i > 0 && (
              <ChevronRightIcon className="text-ink-400 h-4 w-4 shrink-0" />
            )}
            <Link
              href={s.href}
              aria-current={s.active ? 'page' : undefined}
              className={clsx(
                'rounded-md px-2 py-1',
                s.active
                  ? 'bg-ink-100 text-ink-900 font-semibold'
                  : 'text-primary-700 hover:bg-canvas-50'
              )}
            >
              {s.label}
            </Link>
          </Fragment>
        ))}
        {children.length > 0 && (
          <DropdownMenu
            buttonClass="text-ink-500 hover:text-ink-900 hover:bg-canvas-50 min-h-[32px] min-w-[32px] justify-center rounded-md"
            buttonContent={(open) => (
              <>
                <ChevronRightIcon
                  className={clsx(
                    'h-4 w-4 transition-transform',
                    open && 'rotate-90'
                  )}
                  aria-hidden
                />
                <span className="sr-only">{`Leaderboards under ${last.label}`}</span>
              </>
            )}
            anchor={{ to: 'bottom start', gap: 4, padding: 8 }}
            menuWidth="w-60"
            // Headless UI caps it at this or the room below, whichever is less.
            menuItemsClass="[--anchor-max-height:60vh] overflow-y-auto"
            items={children.map((c) => ({
              name: c.key,
              isLink: true,
              linkProps: {
                href: c.href,
                onClick: () =>
                  track('sports leaderboard scope select', { scope: c.key }),
              },
              // Keep the names in one column when some have an emoji.
              icon: anyEmoji ? <span aria-hidden>{c.emoji}</span> : undefined,
              buttonContent: <span className="truncate">{c.label}</span>,
            }))}
          />
        )}
      </Row>
    </nav>
  )
}

// The visitor's own place on a board, pinned above it: their rank among
// everyone with a score there (losses included) and their score, or how to
// get on it.
function YourPlace(props: {
  place: SportsLeaderboardPosition | null
  columns: LeaderboardColumn[]
  userId: string
  /** Who's ranked: "traders", "creators". */
  of: string
  /** What to say when they aren't on it. */
  none: string
}) {
  const { place, columns, userId, of, none } = props
  return (
    <Row className="bg-primary-50 mb-2 items-center gap-3 rounded-lg px-3 py-2.5 text-sm">
      <span className="text-primary-700 w-12 shrink-0 font-semibold tabular-nums">
        {place ? `#${formatWithCommas(place.rank)}` : '–'}
      </span>
      <Col className="min-w-0 flex-1">
        <span className="text-ink-900 font-semibold">You</span>
        <span className="text-ink-500 text-xs">
          {place ? `of ${formatWithCommas(place.of)} ${of}` : none}
        </span>
      </Col>
      {place && (
        <span className="text-ink-900 shrink-0 font-medium tabular-nums">
          {columns[0].renderCell({ userId, score: place.score })}
        </span>
      )}
    </Row>
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
  header?: React.ReactNode
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
