import { Contract } from './contract'
import { UserEntitlement } from './shop/types'
import { isSupporter } from './supporter-config'

/**
 * The news feed: stories gathered from public news indexes, each shown with
 * the open markets whose outcome the story bears on, and the checkable
 * claims quoted from its article. Prototype; see
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

/** Where a story was found. Wikipedia's Current Events portal (CC BY-SA),
 * the GDELT Project (free for any use, cited) and Mediastack (a licensed
 * headline feed) may run in production. Google News RSS is personal-use
 * only by its own notice and stays a prototype source. */
export const NEWS_STORY_ORIGINS = [
  'wikipedia',
  'gdelt',
  'mediastack',
  'google-news',
] as const

export type NewsStoryOrigin = (typeof NEWS_STORY_ORIGINS)[number]

export const isNewsStoryOrigin = (s: string): s is NewsStoryOrigin =>
  (NEWS_STORY_ORIGINS as readonly string[]).includes(s)

/** Where article bodies for claims come from. TollBit (a licence per page,
 * at the publisher's rate) is licensed. GNews returns text it does not own
 * and 'rss' reads outlet pages whose terms forbid it: both prototype only.
 * The Guardian's Open Platform was the other licensed route until it
 * declined us a commercial key on 2026-10-30, as a prediction market. */
export const NEWS_ARTICLE_SOURCES = ['tollbit', 'gnews', 'rss'] as const

export type NewsArticleSource = (typeof NEWS_ARTICLE_SOURCES)[number]

export const isNewsArticleSource = (s: string): s is NewsArticleSource =>
  (NEWS_ARTICLE_SOURCES as readonly string[]).includes(s)

/** Where pictures come from: Wikimedia Commons (free licences, credited on
 * the card), outlets' own thumbnails (publisher images we do not license:
 * prototype only), or nowhere. */
export type NewsImageSource = 'wikimedia' | 'outlets' | 'none'

/** Where the feed reads from, as the server is configured. */
export type NewsFeedConfig = {
  sources: NewsStoryOrigin[]
  /** Empty when no article source is configured: there are no claims. */
  articles: NewsArticleSource[]
  images: NewsImageSource
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** The Current Events portal page for a day (UTC), e.g.
 * Portal:Current_events/2026_October_28. */
export const wikiCurrentEventsTitle = (day: Date) =>
  `Portal:Current_events/${day.getUTCFullYear()}_${
    MONTHS[day.getUTCMonth()]
  }_${day.getUTCDate()}`

export const wikiCurrentEventsUrl = (time: number) =>
  `https://en.wikipedia.org/wiki/${wikiCurrentEventsTitle(new Date(time))}`

/**
 * The article a card leads with, when we found one we can read: its own
 * headline, outlet, time and picture. Claims are quoted from its body.
 */
export type NewsArticle = {
  url: string
  title: string
  publisher: string
  /** The writer, as the publisher gives it; shown unaltered when present. */
  byline?: string
  /** The outlet's home page, for the favicon. */
  site: string
  publishedTime: number
  image?: string
}

export const NEWS_SPEAKER_KINDS = [
  'author',
  'official',
  'politician',
  'expert',
  'organization',
  'other',
] as const

export type NewsSpeakerKind = (typeof NEWS_SPEAKER_KINDS)[number]

/** A market drafted from a claim, for a reader to review, edit and publish.
 * Nothing is created until a reader publishes it. */
export type NewsMarketDraft = {
  /** A standalone yes/no question with its threshold and deadline. */
  question: string
  /** When it resolves YES, when NO, and what happens if it is unclear. */
  criteria: string
  definitions: { term: string; meaning: string }[]
  /** Proposed close (ms). */
  closeTime: number
  /** When and how it resolves after close. */
  resolution: string
  /** Public sources anyone can check. */
  evidence: { name: string; url?: string }[]
}

/** A checkable claim quoted from an article. */
export type NewsClaim = {
  id: string
  /** Verbatim from the article body; checked against the text. */
  excerpt: string
  /** Who makes the claim: a person, an organisation, or the outlet itself. */
  speaker: string
  speakerRole?: string
  speakerKind: NewsSpeakerKind
  /** A market whose resolution turns on exactly what the claim asserts. */
  matchId?: string
  /** Who linked the match: the matcher, or a member. */
  matchBy?: 'ai' | 'reader'
  /** Offered for creation when no market tests the claim. */
  draft?: NewsMarketDraft
  /** Existing markets near the claim, offered for reuse while drafting. */
  similarIds: string[]
}

/**
 * Whether a story's claims were looked for, and what came of it:
 * no-article: we hold no full text for the story, so claims were not read;
 * pending: an article was found and is waiting to be read;
 * none: the article was read and nothing in it makes a resolvable market;
 * found: at least one claim is matched or can be drafted.
 */
export type NewsClaimsStatus = 'no-article' | 'pending' | 'none' | 'found'

/** The credit a Wikimedia Commons picture carries: its author and licence,
 * and the file page that lists both. */
export type NewsImageCredit = {
  author?: string
  license: string
  licenseUrl?: string
  /** The Commons file page. */
  url: string
}

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
  /** Who to credit for the picture; present when it is a Commons image. */
  imageCredit?: NewsImageCredit
  /** Markets the story bears on, strongest first. Verified by the AI pass. */
  contractIds: string[]
  /** Embedding neighbours before verification, kept for tuning the matcher. */
  candidateIds: string[]
  /** Whether the story implies an open question that could become a market. */
  forecastable?: boolean
  /** Freshness times how much there is to trade on; used for thumbnails. */
  score: number
  /** The article the card leads with, when one was found and read. */
  article?: NewsArticle
  claims?: NewsClaim[]
  claimsStatus?: NewsClaimsStatus
  /** The one market shown on the folded card, when one stands out on
   * relevance, trading and freshness. Set per request by the API. */
  featuredId?: string
  /** Related markets readers attached to the story. */
  readerContractIds?: string[]
}

export type NewsFeedCounts = Partial<Record<NewsCategory, number>>

/** How the feed is ordered. Newest is the default. */
export const NEWS_SORTS = [
  { key: 'newest', label: 'Newest' },
  { key: 'top', label: 'Top' },
  { key: 'liked', label: 'Most liked' },
] as const

export type NewsSort = (typeof NEWS_SORTS)[number]['key']

/** One of the day's top stories and why it was picked. */
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
  /** What this server reads, so the page can say where stories come from.
   * Optional only so a page outlives an older server during a rollout. */
  config?: NewsFeedConfig
  /** Newest first. */
  stories: NewsStory[]
  /** Stories matching the filter before paging. */
  total: number
  /** Linked stories per category, for the rail. */
  counts: NewsFeedCounts
  /** Every contract referenced by `stories` or `topStories`, with the
   * heavy fields stripped. */
  contracts: Contract[]
  /** The day's top stories, best first: the first leads the page, the rest
   * are the mini-features under it. Empty while the feed builds. */
  topStories: NewsSpotlight[]
  /** Likes per story, for the stories in this response. */
  likes: Record<string, number>
  /** Stories the signed-in caller has liked. */
  likedStoryIds: string[]
  /** For markets in this response that more than one story links: how many
   * stories link them. The same market serves every article on an event. */
  storyCounts: Record<string, number>
  /** The view this response answers, so a page can tell a stale response
   * (still showing while a new filter loads) from a fresh one. */
  view: {
    categories: NewsCategory[]
    sort: NewsSort
    includeUnlinked: boolean
  }
}

/** Below this many traders a price is an early guess, not a crowd forecast,
 * and the feed says so. */
export const NEWS_FEW_TRADERS = 10

/** How a market a member adds relates to the story: a direct test of a
 * claim, or a broader forecast shown under the related outlook. */
export type NewsMarketRelation = 'direct' | 'related'

/** Linking a market to a story is for members: any active supporter tier.
 * The page's controls and the server apply this same rule. */
export const canLinkNewsMarkets = (
  entitlements: UserEntitlement[] | undefined
) => isSupporter(entitlements)
