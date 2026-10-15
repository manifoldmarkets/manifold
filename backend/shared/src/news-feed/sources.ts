import { uniqBy } from 'lodash'
import { NewsCategory, NewsSourceLink, NewsStoryOrigin } from 'common/news-feed'
import { log } from 'shared/utils'

/**
 * Where stories come from. Two free indexes for the prototype:
 *
 * - Wikipedia's Current Events portal: 15 to 20 human-clustered stories a day,
 *   each a neutral sentence with its outlets linked (CC BY-SA; we keep the
 *   links and the sentence as context, nothing more).
 * - Google News RSS: the top stories and one feed per section, with the
 *   related coverage Google lists under each item. Fine for a prototype;
 *   production needs a licensed feed (see the proposal).
 */

export type RawStory = {
  origin: NewsStoryOrigin
  /** Stable across refreshes: the primary url, or the wiki sentence. */
  key: string
  headline: string
  summary?: string
  topic?: string
  category: NewsCategory
  publishedTime: number
  sources: NewsSourceLink[]
}

const USER_AGENT = 'ManifoldNewsFeed/0.1 (prototype; https://manifold.markets)'
const FETCH_TIMEOUT_MS = 15_000

export async function fetchText(url: string) {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  return res.text()
}

export const hostnameOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return undefined
  }
}

/** One link per outlet, first seen wins. */
export const dedupeSources = (sources: NewsSourceLink[]) =>
  uniqBy(
    sources.filter((s) => s.url && s.name),
    (s) => hostnameOf(s.url) ?? s.url
  )

const decodeEntities = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))

// ---------------------------------------------------------------------------
// Wikipedia: Portal:Current events/<year> <Month> <day>

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

export const wikiCurrentEventsTitle = (day: Date) =>
  `Portal:Current_events/${day.getUTCFullYear()}_${
    MONTHS[day.getUTCMonth()]
  }_${day.getUTCDate()}`

const WIKI_SECTION_CATEGORY: Record<string, NewsCategory> = {
  'armed conflicts and attacks': 'world',
  'arts and culture': 'culture',
  'business and economy': 'economy',
  'disasters and accidents': 'world',
  'health and environment': 'science',
  'international relations': 'world',
  'law and crime': 'world',
  'politics and elections': 'politics',
  'science and technology': 'tech',
  sports: 'sport',
}

const WIKI_SOURCE_RE = /\[(https?:\/\/[^\s\]]+)\s*\(([^)]*)\)\]/g

const cleanWikitext = (s: string) =>
  s
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(WIKI_SOURCE_RE, '')
    .replace(/\[https?:\/\/[^\]]*\]/g, '')
    .replace(/'{2,}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const firstSentence = (text: string) => {
  const m = text.match(/^(.+?[.!?])(\s|$)/)
  const s = m ? m[1] : text
  return s.length > 160 ? s.slice(0, 157).trimEnd() + '…' : s
}

/** Parses one day's portal page into stories: the deepest bullets that cite
 * a source, with their parent bullets as the topic. */
export function parseWikiCurrentEvents(wikitext: string, day: Date) {
  const stories: RawStory[] = []
  let category: NewsCategory = 'other'
  const parents: string[] = []
  // The page has no times; order within the day stands in for them.
  const base = Date.UTC(
    day.getUTCFullYear(),
    day.getUTCMonth(),
    day.getUTCDate(),
    12
  )
  for (const raw of wikitext.split('\n')) {
    const line = raw.trim()
    if (/^'''/.test(line)) {
      category =
        WIKI_SECTION_CATEGORY[cleanWikitext(line).toLowerCase()] ?? 'other'
      parents.length = 0
      continue
    }
    const m = line.match(/^(\*+)(.*)$/)
    if (!m) continue
    const depth = m[1].length
    const body = m[2].trim()
    parents.length = depth - 1
    const text = cleanWikitext(body)
    if (!text) continue
    const sources: NewsSourceLink[] = []
    for (const s of body.matchAll(WIKI_SOURCE_RE)) {
      sources.push({
        url: s[1],
        name: cleanWikitext(s[2]) || hostnameOf(s[1]) || 'Source',
      })
    }
    if (sources.length === 0) {
      parents[depth - 1] = text
      continue
    }
    const topic = parents.filter(Boolean).slice(-2).join(' · ') || undefined
    stories.push({
      origin: 'wikipedia',
      key: text,
      headline: firstSentence(text),
      summary: text,
      topic,
      category,
      publishedTime: base + stories.length * 60_000,
      sources: dedupeSources(sources),
    })
  }
  return stories
}

export async function fetchWikipediaCurrentEvents(day: Date) {
  const title = wikiCurrentEventsTitle(day)
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(
    title
  )}&prop=wikitext&format=json&formatversion=2`
  const json = JSON.parse(await fetchText(url)) as {
    parse?: { wikitext?: string }
    error?: { info?: string }
  }
  const wikitext = json.parse?.wikitext
  if (!wikitext) {
    log.warn('news-feed: no wikitext for ' + title, { error: json.error })
    return []
  }
  return parseWikiCurrentEvents(wikitext, day)
}

// ---------------------------------------------------------------------------
// Google News RSS

const GN = 'https://news.google.com/rss'
const GN_PARAMS = 'hl=en-US&gl=US&ceid=US:en'

export const GOOGLE_NEWS_FEEDS: { url: string; category: NewsCategory }[] = [
  { url: `${GN}?${GN_PARAMS}`, category: 'other' },
  {
    url: `${GN}/headlines/section/topic/WORLD?${GN_PARAMS}`,
    category: 'world',
  },
  {
    url: `${GN}/headlines/section/topic/NATION?${GN_PARAMS}`,
    category: 'politics',
  },
  {
    url: `${GN}/headlines/section/topic/BUSINESS?${GN_PARAMS}`,
    category: 'economy',
  },
  {
    url: `${GN}/headlines/section/topic/TECHNOLOGY?${GN_PARAMS}`,
    category: 'tech',
  },
  {
    url: `${GN}/headlines/section/topic/SCIENCE?${GN_PARAMS}`,
    category: 'science',
  },
  {
    url: `${GN}/headlines/section/topic/HEALTH?${GN_PARAMS}`,
    category: 'science',
  },
  {
    url: `${GN}/headlines/section/topic/SPORTS?${GN_PARAMS}`,
    category: 'sport',
  },
  {
    url: `${GN}/headlines/section/topic/ENTERTAINMENT?${GN_PARAMS}`,
    category: 'culture',
  },
]

const tag = (xml: string, name: string) => {
  const m = xml.match(
    new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`)
  )
  return m ? decodeEntities(m[1]).trim() : ''
}

/** Items from one feed. Google lists related coverage inside the
 * description as links followed by the outlet name; those become sources. */
export function parseGoogleNewsRss(
  xml: string,
  category: NewsCategory,
  fetchedAt: number
) {
  const stories: RawStory[] = []
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const item = m[1]
    const rawTitle = tag(item, 'title')
    const link = tag(item, 'link')
    const sourceName = tag(item, 'source')
    const sourceUrl = (item.match(/<source[^>]*url="([^"]+)"/) ?? [])[1]
    if (!rawTitle || !link) continue
    const title =
      sourceName && rawTitle.endsWith(' - ' + sourceName)
        ? rawTitle.slice(0, -(sourceName.length + 3))
        : rawTitle
    const pub = Date.parse(tag(item, 'pubDate'))
    const sources: NewsSourceLink[] = [
      {
        name: sourceName || hostnameOf(sourceUrl ?? link) || 'Source',
        url: link,
      },
    ]
    const description = decodeEntities(tag(item, 'description'))
    for (const a of description.matchAll(
      /<a href="([^"]+)"[^>]*>([^<]*)<\/a>(?:\s|&nbsp;)*<font[^>]*>([^<]*)<\/font>/g
    )) {
      sources.push({ url: a[1], name: a[3].trim() || a[2].trim() })
    }
    stories.push({
      origin: 'google-news',
      key: link,
      headline: title.trim(),
      category,
      publishedTime: Number.isFinite(pub) ? pub : fetchedAt,
      sources: dedupeSources(sources),
    })
  }
  return stories
}

export async function fetchGoogleNews(fetchedAt = Date.now()) {
  const results = await Promise.allSettled(
    GOOGLE_NEWS_FEEDS.map(async (feed) =>
      parseGoogleNewsRss(await fetchText(feed.url), feed.category, fetchedAt)
    )
  )
  const stories: RawStory[] = []
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') stories.push(...r.value)
    else
      log.warn('news-feed: google news feed failed', {
        url: GOOGLE_NEWS_FEEDS[i].url,
        error: String(r.reason),
      })
  })
  // Section feeds repeat the top stories; keep the first (most specific
  // category wins because the top feed is listed first... so prefer later).
  const byKey = new Map<string, RawStory>()
  for (const s of stories) {
    const prev = byKey.get(s.key)
    if (!prev) byKey.set(s.key, s)
    else if (prev.category === 'other' && s.category !== 'other')
      byKey.set(s.key, {
        ...s,
        sources: dedupeSources([...prev.sources, ...s.sources]),
      })
  }
  return [...byKey.values()]
}

/** Everything the feed reads, in one call. Failures are logged, not thrown:
 * a dead source should not blank the page. */
export async function gatherRawStories(now = Date.now()) {
  const day = 24 * 60 * 60 * 1000
  const days = [0, 1, 2].map((d) => new Date(now - d * day))
  const [wiki, google] = await Promise.all([
    Promise.allSettled(days.map((d) => fetchWikipediaCurrentEvents(d))),
    fetchGoogleNews(now).catch((e) => {
      log.error('news-feed: google news failed', { error: String(e) })
      return [] as RawStory[]
    }),
  ])
  const stories: RawStory[] = []
  wiki.forEach((r, i) => {
    if (r.status === 'fulfilled') stories.push(...r.value)
    else
      log.warn('news-feed: wikipedia day failed', {
        day: days[i].toISOString(),
        error: String(r.reason),
      })
  })
  stories.push(...google)
  return stories
}
