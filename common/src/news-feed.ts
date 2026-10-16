import { Contract } from './contract'

/**
 * The news feed: stories gathered from public news indexes, each shown with
 * the open markets whose outcome the story bears on. Prototype; see
 * dev-docs/news-feed-prototype.md.
 */

export const NEWS_CATEGORIES = [
  { key: 'politics', label: 'Politics', emoji: '🏛️' },
  { key: 'world', label: 'World', emoji: '🌍' },
  { key: 'economy', label: 'Economy', emoji: '📈' },
  { key: 'tech', label: 'Tech', emoji: '💻' },
  { key: 'science', label: 'Science', emoji: '🔬' },
  { key: 'sport', label: 'Sport', emoji: '🏟️' },
  { key: 'culture', label: 'Culture', emoji: '🎬' },
] as const

export type NewsCategory = (typeof NEWS_CATEGORIES)[number]['key'] | 'other'

export const NEWS_CATEGORY_KEYS: NewsCategory[] = [
  ...NEWS_CATEGORIES.map((c) => c.key),
  'other',
]

export const isNewsCategory = (s: string): s is NewsCategory =>
  (NEWS_CATEGORY_KEYS as string[]).includes(s)

export type NewsSourceLink = {
  name: string
  url: string
  /** The outlet's own site, when the link itself is an aggregator redirect. */
  site?: string
}

export type NewsStoryOrigin = 'wikipedia' | 'google-news'

export type NewsStory = {
  id: string
  headline: string
  /** A neutral sentence or two of context, when the source index has one. */
  summary?: string
  /** The running story this belongs to, e.g. "Russo-Ukrainian war". */
  topic?: string
  category: NewsCategory
  origin: NewsStoryOrigin
  /** When the story first appeared (ms). */
  publishedTime: number
  /** Latest coverage seen (ms). The feed is ordered by this, newest first. */
  updatedTime: number
  /** Outlets reporting it, one link each, deduped by host. */
  sources: NewsSourceLink[]
  image?: string
  /** Markets the story bears on, strongest first. Verified by the AI pass. */
  contractIds: string[]
  /** Embedding neighbours before verification, kept for tuning the matcher. */
  candidateIds: string[]
  /** Whether the story implies an open question that could become a market. */
  forecastable?: boolean
  /** Freshness times how much there is to trade on; used for thumbnails. */
  score: number
}

export type NewsFeedCounts = Partial<Record<NewsCategory, number>>

/** How the feed is ordered. Newest is the default. */
export const NEWS_SORTS = [
  { key: 'newest', label: 'Newest' },
  { key: 'top', label: 'Top' },
  { key: 'liked', label: 'Most liked' },
] as const

export type NewsSort = (typeof NEWS_SORTS)[number]['key']

/** The day's top story and why it was picked. */
export type NewsSpotlight = {
  story: NewsStory
  /** Most liked today, or else the most traded on its markets today. */
  reason: 'likes' | 'volume'
  /** The like count, or the day's volume in mana. */
  value: number
}

export type NewsFeedResponse = {
  /** False when the server is not running the feed (NEWS_FEED_ENABLED). */
  enabled: boolean
  refreshing: boolean
  updatedTime: number | null
  lastError?: string
  /** Newest first. */
  stories: NewsStory[]
  /** Stories matching the filter before paging. */
  total: number
  /** Linked stories per category, for the rail. */
  counts: NewsFeedCounts
  /** Every contract referenced by `stories`, `resolvingSoon` or `spotlight`,
   * with the heavy fields stripped. */
  contracts: Contract[]
  /** Linked markets closing within a week, soonest first. */
  resolvingSoon: string[]
  spotlight?: NewsSpotlight
  /** Likes per story, for the stories in this response. */
  likes: Record<string, number>
  /** Stories the signed-in caller has liked. */
  likedStoryIds: string[]
}

export const NEWS_FEED_RESOLVING_SOON_MS = 7 * 24 * 60 * 60 * 1000
