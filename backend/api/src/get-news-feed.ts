import { maxBy, sortBy, sumBy } from 'lodash'
import { Contract } from 'common/contract'
import {
  isNewsCategory,
  NEWS_FEW_TRADERS,
  NewsFeaturedMarket,
  NewsFeedCounts,
  NewsFeedResponse,
  NewsSpotlight,
  NewsStory,
} from 'common/news-feed'
import { DAY_MS } from 'common/util/time'
import {
  getNewsAttachments,
  getNewsFeedBuild,
  getNewsFeedStatus,
  getNewsLikes,
  isNewsFeedEnabled,
  NewsAttachment,
  refreshNewsFeed,
} from 'shared/news-feed/state'
import { APIHandler } from './helpers/endpoint'

const DEFAULT_LIMIT = 40
/** Markets on the rail under the top story. */
const FEATURED_LIMIT = 4
/** The featured market comes from a story's strongest few, by the
 * verifier's order. */
const FEATURED_FROM_TOP = 3

/**
 * The news feed page's data: stories newest first with their linked markets
 * and claims, the day's top story with the busiest markets after it, and
 * likes.
 * Served from the in-process build that the refresher keeps current, with
 * what readers attached laid over it; the first request kicks off a build.
 */
export const getNewsFeed: APIHandler<'get-news-feed'> = async (props, auth) => {
  const {
    categories,
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
    featured: [],
    likes: {},
    likedStoryIds: [],
    storyCounts: {},
    view: {
      categories: (categories ?? []).filter(isNewsCategory),
      sort,
      includeUnlinked,
    },
  }
  if (!base.enabled) return base

  const build = getNewsFeedBuild()
  if (!build) {
    void refreshNewsFeed('first request')
    return { ...base, refreshing: true }
  }

  const now = Date.now()
  const { attachments, contracts: attachedContracts } = getNewsAttachments()
  const contractFor = (id: string): Contract | undefined =>
    build.contractsById[id] ?? attachedContracts[id]
  const likes = getNewsLikes()
  const likeCount = (storyId: string) => likes[storyId]?.length ?? 0

  const attachmentsByStory = new Map<string, NewsAttachment[]>()
  for (const a of attachments) {
    if (!contractFor(a.contractId)) continue
    attachmentsByStory.set(a.storyId, [
      ...(attachmentsByStory.get(a.storyId) ?? []),
      a,
    ])
  }

  /** The story with what readers attached: direct matches beside their
   * claims, related markets after the matcher's. */
  const withReaders = (s: NewsStory): NewsStory => {
    const mine = attachmentsByStory.get(s.id)
    if (!mine) return s
    const claims = s.claims?.map((c) => {
      const direct = mine.find(
        (a) => a.relation === 'direct' && a.claimId === c.id
      )
      return direct
        ? {
            ...c,
            matchId: direct.contractId,
            matchBy: 'reader' as const,
            draft: undefined,
          }
        : c
    })
    const readerContractIds = mine
      .filter((a) => a.relation === 'related')
      .map((a) => a.contractId)
      .filter((id) => !s.contractIds.includes(id))
    return { ...s, claims, readerContractIds }
  }

  /** The one market worth showing on the folded card: among the story's
   * strongest few, an established market, weighted to the busiest and most
   * recently traded. None when nothing stands out. */
  const featuredFor = (s: NewsStory) => {
    const direct = new Set(
      (s.claims ?? []).flatMap((c) => (c.matchId ? [c.matchId] : []))
    )
    const options = s.contractIds
      .filter((id) => !direct.has(id))
      .slice(0, FEATURED_FROM_TOP)
      .flatMap((id, rank) => {
        const c = contractFor(id)
        return c && (c.uniqueBettorCount ?? 0) >= NEWS_FEW_TRADERS
          ? [{ c, rank }]
          : []
      })
    const weight = ({ c, rank }: { c: Contract; rank: number }) => {
      const relevance = 1 / (1 + rank)
      const activity =
        Math.log10(1 + (c.uniqueBettorCount ?? 0)) +
        0.5 * Math.log10(1 + Math.max(0, c.volume24Hours ?? 0))
      const fresh = c.lastBetTime && now - c.lastBetTime < 7 * DAY_MS ? 1 : 0.6
      const w = relevance * (1 + activity) * fresh
      return Number.isFinite(w) ? w : 0
    }
    return maxBy(options, weight)?.c.id
  }

  const present = (s: NewsStory): NewsStory => {
    const story = withReaders(s)
    return { ...story, featuredId: featuredFor(story) }
  }

  /** Open markets on the story from any source: the matcher's links, a
   * claim's direct match, or one a reader attached. */
  const hasMarket = (s: NewsStory) =>
    s.contractIds.some((id) => contractFor(id)) ||
    (s.claims ?? []).some((c) => !!c.matchId && !!contractFor(c.matchId)) ||
    (attachmentsByStory.get(s.id)?.length ?? 0) > 0
  const linked = build.stories.filter(hasMarket)
  const counts: NewsFeedCounts = {}
  for (const s of linked) counts[s.category] = (counts[s.category] ?? 0) + 1

  // Sorted here rather than trusting the build order, which a cached build
  // from an older version may not share.
  const pool = includeUnlinked ? build.stories : linked
  const wanted = new Set((categories ?? []).filter(isNewsCategory))
  const filtered =
    wanted.size > 0 ? pool.filter((s) => wanted.has(s.category)) : pool
  const ordered =
    sort === 'top'
      ? sortBy(filtered, (s) => -s.score)
      : sort === 'liked'
      ? sortBy(
          filtered,
          (s) => -likeCount(s.id),
          (s) => -s.updatedTime
        )
      : sortBy(filtered, (s) => -s.updatedTime)
  const page = ordered.slice(offset, offset + limit).map(present)

  // The day's top story: the most liked, or failing any likes the one whose
  // markets traded the most today. Widen to two days on a quiet day.
  const dayVolume = (s: NewsStory) =>
    sumBy(s.contractIds, (id) => contractFor(id)?.volume24Hours ?? 0)
  const pickSpotlight = (windowMs: number): NewsSpotlight | undefined => {
    const recent = linked.filter((s) => now - s.updatedTime < windowMs)
    if (recent.length === 0) return undefined
    const mostLiked = maxBy(recent, (s) => likeCount(s.id))
    if (mostLiked && likeCount(mostLiked.id) > 0)
      return {
        story: present(mostLiked),
        reason: 'likes',
        value: likeCount(mostLiked.id),
      }
    const mostTraded = maxBy(recent, dayVolume)
    return mostTraded && dayVolume(mostTraded) > 0
      ? {
          story: present(mostTraded),
          reason: 'volume',
          value: dayVolume(mostTraded),
        }
      : undefined
  }
  const spotlight = pickSpotlight(DAY_MS) ?? pickSpotlight(2 * DAY_MS)

  const storiesOut = spotlight ? [...page, spotlight.story] : page
  const marketIdsOf = (s: NewsStory) => [
    ...s.contractIds,
    ...(s.readerContractIds ?? []),
    ...(s.claims ?? []).flatMap((c) => [
      ...(c.matchId ? [c.matchId] : []),
      ...c.similarIds,
    ]),
  ]

  // Under the top story: the markets in the news with the most trading
  // today. Established and open, each once, and none already on the top
  // story's card. Busiest first; on a quiet day, the most traded.
  const heroIds = new Set(spotlight ? marketIdsOf(spotlight.story) : [])
  const finite = (n: number | undefined) =>
    n != null && Number.isFinite(n) ? n : 0
  const candidates = linked.flatMap((s) =>
    [
      ...s.contractIds,
      ...(s.claims ?? []).flatMap((c) => (c.matchId ? [c.matchId] : [])),
    ].flatMap((id) => {
      const c = contractFor(id)
      return c ? [{ s, c }] : []
    })
  )
  const featured: NewsFeaturedMarket[] = []
  for (const { s, c } of sortBy(
    candidates,
    ({ c }) => -finite(c.volume24Hours),
    ({ c }) => -finite(c.uniqueBettorCount),
    ({ s }) => -s.updatedTime
  )) {
    if (featured.length >= FEATURED_LIMIT) break
    if (heroIds.has(c.id) || featured.some((f) => f.contractId === c.id))
      continue
    if (finite(c.uniqueBettorCount) < NEWS_FEW_TRADERS) continue
    if (c.isResolved || (c.closeTime != null && c.closeTime <= now)) continue
    featured.push({ contractId: c.id, storyId: s.id, headline: s.headline })
  }

  const ids = new Set<string>([
    ...storiesOut.flatMap(marketIdsOf),
    ...featured.map((f) => f.contractId),
  ])
  const contracts = [...ids]
    .map((id) => contractFor(id))
    .filter((c): c is Contract => !!c)

  // The same market serves every story on an event; say how many.
  const storyCounts: Record<string, number> = {}
  const tally: Record<string, number> = {}
  for (const s of build.stories)
    for (const id of new Set([
      ...s.contractIds,
      ...(s.claims ?? []).flatMap((c) => (c.matchId ? [c.matchId] : [])),
    ]))
      tally[id] = (tally[id] ?? 0) + 1
  for (const id of ids) if ((tally[id] ?? 0) > 1) storyCounts[id] = tally[id]

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
    featured,
    spotlight,
    likes: likesOut,
    likedStoryIds,
    storyCounts,
  }
}
