import { sortBy } from 'lodash'
import { Contract } from 'common/contract'
import {
  isNewsCategory,
  NEWS_FEED_RESOLVING_SOON_MS,
  NewsFeedCounts,
  NewsFeedResponse,
} from 'common/news-feed'
import {
  getNewsFeedBuild,
  getNewsFeedStatus,
  isNewsFeedEnabled,
  refreshNewsFeed,
} from 'shared/news-feed/state'
import { APIHandler } from './helpers/endpoint'

const DEFAULT_LIMIT = 40
const RESOLVING_SOON_LIMIT = 12

/**
 * The news feed page's data: stories with their linked markets, the markets
 * closing soon, and the spotlight question. Served from the in-process build
 * that the refresher keeps current; the first request kicks off a build.
 */
export const getNewsFeed: APIHandler<'get-news-feed'> = async (props) => {
  const {
    category,
    limit = DEFAULT_LIMIT,
    offset = 0,
    includeUnlinked = false,
  } = props
  const status = getNewsFeedStatus()
  const base: NewsFeedResponse = {
    enabled: isNewsFeedEnabled(),
    refreshing: status.refreshing,
    updatedTime: status.updatedTime,
    lastError: status.lastError,
    stories: [],
    total: 0,
    counts: {},
    contracts: [],
    resolvingSoon: [],
  }
  if (!base.enabled) return base

  const build = getNewsFeedBuild()
  if (!build) {
    void refreshNewsFeed('first request')
    return { ...base, refreshing: true }
  }

  const { contractsById } = build
  const linked = build.stories.filter((s) =>
    s.contractIds.some((id) => contractsById[id])
  )
  const counts: NewsFeedCounts = {}
  for (const s of linked) counts[s.category] = (counts[s.category] ?? 0) + 1

  const pool = includeUnlinked ? build.stories : linked
  const filtered =
    category && isNewsCategory(category)
      ? pool.filter((s) => s.category === category)
      : pool
  const page = filtered.slice(offset, offset + limit)

  const now = Date.now()
  const resolvingSoon = sortBy(
    Object.values(contractsById).filter(
      (c) =>
        c.closeTime != null &&
        c.closeTime > now &&
        c.closeTime - now < NEWS_FEED_RESOLVING_SOON_MS
    ),
    (c) => c.closeTime
  )
    .slice(0, RESOLVING_SOON_LIMIT)
    .map((c) => c.id)

  const spotlight = build.spotlight
  const ids = new Set<string>([
    ...page.flatMap((s) => s.contractIds),
    ...resolvingSoon,
    ...(spotlight ? [spotlight.contractId] : []),
  ])
  const contracts = [...ids]
    .map((id) => contractsById[id])
    .filter((c): c is Contract => !!c)

  return {
    ...base,
    stories: page,
    total: filtered.length,
    counts,
    contracts,
    resolvingSoon,
    spotlight,
  }
}
