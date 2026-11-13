import { ChevronRightIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import dayjs from 'dayjs'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import { APIParams } from 'common/api/schema'
import { CURATED_SPORTS, sportsPathForTopic } from 'common/sports-schedule'
import {
  findSportsHub,
  SportsHub,
  SportsHubStatus,
  sportsHubStatus,
} from 'common/sports-search'
import { useIsPageVisible } from 'web/hooks/use-page-visible'
import { api } from 'web/lib/api/api'
import { track } from 'web/lib/service/analytics'
import { useSportsIndex } from './use-sports-index'

/**
 * The /sports hub a search names ("nba", "premier league"), and where each
 * topic under Sports opens, so a topic result can link to its sports page
 * rather than to a topic page that redirects there. Nothing while not
 * `enabled`.
 */
export function useSportsHubSearch(term: string, enabled = true) {
  const { index } = useSportsIndex(enabled)
  // The curated sports are known before the topic tree loads.
  const hub = useMemo(
    () =>
      enabled
        ? findSportsHub(term, index ?? { sports: CURATED_SPORTS })
        : undefined,
    [term, index, enabled]
  )
  const topicHref = useMemo(
    () =>
      index
        ? (topic: { id: string; slug: string }) =>
            sportsPathForTopic(topic, index)
        : undefined,
    [index]
  )
  return { hub, topicHref }
}

// Live counts move with kickoffs; a minute old is fresh enough for a search
// result, and typing on past the hub's name doesn't ask again.
const STATUS_TTL_MS = 60_000
const statusCache = new Map<string, { at: number; status: SportsHubStatus }>()

const scheduleRequest = (hub: SportsHub): APIParams<'sports-schedule'> =>
  hub.kind === 'all'
    ? { sport: 'all', limit: 1, includeRelated: false }
    : hub.kind === 'sport'
    ? // Every live game comes on the first page; the counts give the rest.
      { sport: hub.sport, limit: 1, includeRelated: false }
    : // A topic's page has no counts, so look at a few of its games.
      { sport: hub.sport, topic: hub.topicId, limit: 10, includeRelated: false }

function useSportsHubStatus(hub: SportsHub) {
  const visible = useIsPageVisible()
  const [state, setState] = useState<{
    path: string
    status?: SportsHubStatus
    failed?: boolean
  }>(() => ({ path: hub.path, status: statusCache.get(hub.path)?.status }))

  useEffect(() => {
    const { path } = hub
    setState({ path, status: statusCache.get(path)?.status })
    if (!visible) return
    let active = true
    const load = async () => {
      const cached = statusCache.get(path)
      if (cached && Date.now() - cached.at < STATUS_TTL_MS) {
        setState({ path, status: cached.status })
        return
      }
      // Aged from the request, so the interval's next tick finds it stale.
      const at = Date.now()
      try {
        const schedule = await api('sports-schedule', scheduleRequest(hub))
        const status = sportsHubStatus(hub, schedule)
        statusCache.set(path, { at, status })
        if (active) setState({ path, status })
      } catch (e) {
        console.error('Failed to load a sports hub status', e)
        // An old count is worse than none.
        if (active) setState({ path, failed: true })
      }
    }
    load()
    const interval = setInterval(load, STATUS_TTL_MS)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [hub.path, visible])

  return state.path === hub.path ? state : { path: hub.path }
}

/**
 * The hub as a search's first result: "🏀 NBA hub · 2 games live now".
 */
export function SportsHubSearchResult(props: {
  hub: SportsHub
  term: string
  className?: string
}) {
  const { status, failed } = useSportsHubStatus(props.hub)
  return <SportsHubCard {...props} status={status} failed={failed} />
}

export function SportsHubCard(props: {
  hub: SportsHub
  term: string
  /** Undefined while loading. */
  status?: SportsHubStatus
  failed?: boolean
  className?: string
}) {
  const { hub, term, status, failed, className } = props
  return (
    <Link
      href={hub.path}
      onClick={() =>
        track('click search sports hub', {
          path: hub.path,
          kind: hub.kind,
          term,
          live: status?.live,
        })
      }
      className={clsx(
        'group flex min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 ring-1 transition-colors',
        // The Sports pill's turf to leather, paler: a place, not a filter.
        'ring-ink-200 bg-gradient-to-r from-green-50 to-[#8b4513]/10 hover:from-green-100 hover:to-[#8b4513]/20',
        'dark:from-green-900/30 dark:to-[#8b4513]/25 dark:hover:from-green-900/50 dark:hover:to-[#8b4513]/40',
        'focus-visible:ring-primary-500 outline-none focus-visible:ring-2',
        className
      )}
    >
      <span
        aria-hidden
        className="bg-canvas-0 ring-ink-200 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl ring-1"
      >
        {hub.emoji}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-ink-900 truncate font-semibold leading-tight">
          {hub.label} hub
        </span>
        <HubStatusLine status={status} failed={failed} />
      </span>
      <span className="text-ink-600 group-hover:text-ink-900 hidden shrink-0 text-sm font-medium sm:inline">
        Open
      </span>
      <ChevronRightIcon
        aria-hidden
        className="text-ink-500 group-hover:text-ink-900 h-5 w-5 shrink-0"
      />
    </Link>
  )
}

function HubStatusLine(props: { status?: SportsHubStatus; failed?: boolean }) {
  const { status, failed } = props
  if (!status)
    return failed ? (
      <span className="text-ink-600 truncate text-sm">
        Games, odds and futures
      </span>
    ) : (
      <span className="flex h-5 items-center">
        <span
          aria-hidden
          className="bg-ink-200 h-3 w-40 max-w-full animate-pulse rounded"
        />
        <span className="sr-only">Loading what's on</span>
      </span>
    )
  const { live, upcoming, moreUpcoming, nextStart, noun } = status
  const upcomingText =
    upcoming > 0 ? `${upcoming}${moreUpcoming ? '+' : ''} upcoming` : undefined
  if (live > 0)
    return (
      <span className="flex min-w-0 items-center gap-1.5 text-sm">
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-red-500"
        />
        {/* One line that loses its end first: the live count always shows. */}
        <span className="text-ink-600 min-w-0 truncate">
          <span className="font-medium text-red-600 dark:text-red-400">
            {live} {live === 1 ? noun.one : noun.many} live now
          </span>
          {upcomingText && ` · ${upcomingText}`}
        </span>
      </span>
    )
  return (
    <span className="text-ink-600 truncate text-sm">
      {nextStart !== undefined ? (
        <>
          Next {noun.one} {formatStart(nextStart)}
          {/* Phones have room for when, not how many more. */}
          {upcoming > 1 && (
            <span className="hidden sm:inline"> · {upcomingText}</span>
          )}
        </>
      ) : upcomingText ? (
        `${upcomingText} ${noun.many}`
      ) : (
        'Futures, props and more'
      )}
    </span>
  )
}

/** "today, 7:30 PM", "tomorrow, 1:00 PM", "Fri 8:15 PM", "Nov 22". */
function formatStart(ms: number, now = Date.now()) {
  const start = dayjs(ms)
  const today = dayjs(now)
  const time = start.format('h:mm A')
  if (start.isSame(today, 'day')) return `today, ${time}`
  if (start.isSame(today.add(1, 'day'), 'day')) return `tomorrow, ${time}`
  if (start.isBefore(today.add(6, 'day').endOf('day')))
    return start.format('ddd h:mm A')
  return start.format('MMM D')
}
