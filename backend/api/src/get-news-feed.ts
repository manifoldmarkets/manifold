import { maxBy, sortBy, sumBy } from 'lodash'
import { Contract } from 'common/contract'
import {
  isNewsCategory,
  NEWS_FEW_TRADERS,
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
import { cosine } from 'shared/news-feed/markets'
import { articleSources } from 'shared/news-feed/articles'
import { imageSource } from 'shared/news-feed/images'
import { enabledSources } from 'shared/news-feed/sources'
import { APIHandler } from './helpers/endpoint'

const DEFAULT_LIMIT = 40
/** The day's top stories: one in the hero slot, the rest as tiles under
 * it that can take its place. */
const TOP_STORIES_LIMIT = 4
/** Two stories this close in embedding are one event told twice (the merge
 * step joins them at 0.82; this is looser on purpose). */
const SAME_EVENT_SIMILARITY = 0.75
/** The featured market comes from a story's strongest few, by the
 * verifier's order. */
const FEATURED_FROM_TOP = 3

/**
 * The news feed page's data: stories newest first with their linked markets
 * and claims, the day's top stories, and likes.
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
    config: {
      sources: enabledSources(),
      articles: articleSources(),
      images: imageSource(),
    },
    stories: [],
    total: 0,
    counts: {},
    contracts: [],
    topStories: [],
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

  const stories = build.stories

  /** Open markets on the story from any source: the matcher's links, a
   * claim's direct match, or one a reader attached. */
  const hasMarket = (s: NewsStory) =>
    s.contractIds.some((id) => contractFor(id)) ||
    (s.claims ?? []).some((c) => !!c.matchId && !!contractFor(c.matchId)) ||
    (attachmentsByStory.get(s.id)?.length ?? 0) > 0
  const linked = stories.filter(hasMarket)
  const counts: NewsFeedCounts = {}
  for (const s of linked) counts[s.category] = (counts[s.category] ?? 0) + 1

  // Sorted here rather than trusting the build order, which a cached build
  // from an older version may not share.
  const pool = includeUnlinked ? stories : linked
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

  // The day's top stories: the most liked first, then the ones whose
  // markets traded the most today. Yesterday's fill in when today has few.
  const volumeOf = (id: string) => {
    const v = contractFor(id)?.volume24Hours ?? 0
    return Number.isFinite(v) ? v : 0
  }
  const dayVolume = (s: NewsStory) => sumBy(s.contractIds, volumeOf)
  // Picked one at a time, each by the trading it adds to the page: the same
  // event under another headline, whose weight is a market a higher pick
  // already shows, falls to where its own markets put it.
  const topPicks: NewsStory[] = []
  const covered = new Set<string>()
  const addedVolume = (s: NewsStory) =>
    sumBy(
      s.contractIds.filter((id) => !covered.has(id)),
      volumeOf
    )
  const embeddingOf = (id: string) => build.memos[id]?.embedding
  // One story per event even when the trading doesn't settle it: a story
  // that reads like a higher pick (close embeddings, as the merge step
  // judges), or shares two of its specific markets with one, or most of
  // them, is the same news again.
  const sameEvent = (s: NewsStory) => {
    const shared = s.contractIds.filter((id) => covered.has(id)).length
    if (shared >= 2) return true
    if (s.contractIds.length > 0 && shared * 2 >= s.contractIds.length)
      return true
    const mine = embeddingOf(s.id)
    return topPicks.some((t) => {
      const theirs = embeddingOf(t.id)
      return !!mine && !!theirs && cosine(mine, theirs) >= SAME_EVENT_SIMILARITY
    })
  }
  const pickFrom = (windowMs: number) =>
    sortBy(
      linked.filter(
        (s) =>
          !topPicks.includes(s) &&
          now - s.updatedTime < windowMs &&
          (likeCount(s.id) > 0 || addedVolume(s) > 0)
      ),
      (s) => -likeCount(s.id),
      (s) => -addedVolume(s)
    ).find((s) => !sameEvent(s))
  while (topPicks.length < TOP_STORIES_LIMIT) {
    const next = pickFrom(DAY_MS) ?? pickFrom(2 * DAY_MS)
    if (!next) break
    topPicks.push(next)
    for (const id of next.contractIds) covered.add(id)
  }
  const topStories: NewsSpotlight[] = topPicks.map((s) =>
    likeCount(s.id) > 0
      ? { story: present(s), reason: 'likes', value: likeCount(s.id) }
      : { story: present(s), reason: 'volume', value: dayVolume(s) }
  )

  const storiesOut = [...page, ...topStories.map((t) => t.story)]
  const marketIdsOf = (s: NewsStory) => [
    ...s.contractIds,
    ...(s.readerContractIds ?? []),
    ...(s.claims ?? []).flatMap((c) => [
      ...(c.matchId ? [c.matchId] : []),
      ...c.similarIds,
    ]),
  ]
  const ids = new Set<string>(storiesOut.flatMap(marketIdsOf))
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
    topStories,
    likes: likesOut,
    likedStoryIds,
    storyCounts,
  }
}
