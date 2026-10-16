import { maxBy, sortBy, sumBy } from 'lodash'
import { Contract } from 'common/contract'
import {
  isNewsCategory,
  NEWS_FEED_RESOLVING_SOON_MS,
  NewsFeedCounts,
  NewsFeedResponse,
  NewsSpotlight,
  NewsStory,
} from 'common/news-feed'
import { DAY_MS } from 'common/util/time'
import {
  getNewsFeedBuild,
  getNewsFeedStatus,
  getNewsLikes,
  isNewsFeedEnabled,
  refreshNewsFeed,
} from 'shared/news-feed/state'
import { APIHandler } from './helpers/endpoint'

const DEFAULT_LIMIT = 40
const RESOLVING_SOON_LIMIT = 12

/**
 * The news feed page's data: stories newest first with their linked markets,
 * the markets closing soon, the day's top story, and likes. Served from the
 * in-process build that the refresher keeps current; the first request kicks
 * off a build.
 */
export const getNewsFeed: APIHandler<'get-news-feed'> = async (props, auth) => {
  const {
    category,
    limit = DEFAULT_LIMIT,
    offset = 0,
    includeUnlinked = false,
    sort = 'newest',
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
    likes: {},
    likedStoryIds: [],
  }
  if (!base.enabled) return base

  const build = getNewsFeedBuild()
  if (!build) {
    void refreshNewsFeed('first request')
    return { ...base, refreshing: true }
  }

  const now = Date.now()
  const { contractsById } = build
  const likes = getNewsLikes()
  const likeCount = (storyId: string) => likes[storyId]?.length ?? 0

  const linked = build.stories.filter((s) =>
    s.contractIds.some((id) => contractsById[id])
  )
  const counts: NewsFeedCounts = {}
  for (const s of linked) counts[s.category] = (counts[s.category] ?? 0) + 1

  // The build is newest first already; the other orders sort a copy.
  const pool = includeUnlinked ? build.stories : linked
  const filtered =
    category && isNewsCategory(category)
      ? pool.filter((s) => s.category === category)
      : pool
  const ordered =
    sort === 'top'
      ? sortBy(filtered, (s) => -s.score)
      : sort === 'liked'
      ? sortBy(
          filtered,
          (s) => -likeCount(s.id),
          (s) => -s.updatedTime
        )
      : filtered
  const page = ordered.slice(offset, offset + limit)

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

  // The day's top story: the most liked, or failing any likes the one whose
  // markets traded the most today. Widen to two days on a quiet day.
  const dayVolume = (s: NewsStory) =>
    sumBy(s.contractIds, (id) => contractsById[id]?.volume24Hours ?? 0)
  const pickSpotlight = (windowMs: number): NewsSpotlight | undefined => {
    const recent = linked.filter((s) => now - s.updatedTime < windowMs)
    if (recent.length === 0) return undefined
    const mostLiked = maxBy(recent, (s) => likeCount(s.id))
    if (mostLiked && likeCount(mostLiked.id) > 0)
      return {
        story: mostLiked,
        reason: 'likes',
        value: likeCount(mostLiked.id),
      }
    const mostTraded = maxBy(recent, dayVolume)
    return mostTraded && dayVolume(mostTraded) > 0
      ? { story: mostTraded, reason: 'volume', value: dayVolume(mostTraded) }
      : undefined
  }
  const spotlight = pickSpotlight(DAY_MS) ?? pickSpotlight(2 * DAY_MS)

  const storiesOut = spotlight ? [...page, spotlight.story] : page
  const ids = new Set<string>([
    ...storiesOut.flatMap((s) => s.contractIds),
    ...resolvingSoon,
  ])
  const contracts = [...ids]
    .map((id) => contractsById[id])
    .filter((c): c is Contract => !!c)

  const likesOut: Record<string, number> = {}
  for (const s of storiesOut) {
    const n = likeCount(s.id)
    if (n > 0) likesOut[s.id] = n
  }
  const likedStoryIds = auth
    ? storiesOut.filter((s) => likes[s.id]?.includes(auth.uid)).map((s) => s.id)
    : []

  return {
    ...base,
    stories: page,
    total: filtered.length,
    counts,
    contracts,
    resolvingSoon,
    spotlight,
    likes: likesOut,
    likedStoryIds,
  }
}
