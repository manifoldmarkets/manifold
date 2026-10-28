import * as https from 'https'
import { urlToHttpOptions } from 'url'
import { countBy, uniq, uniqBy } from 'lodash'
import { isFaviconAllowed } from 'common/favicon-allowlist'
import {
  isNewsStoryOrigin,
  NewsCategory,
  NewsSourceLink,
  NewsStoryOrigin,
  wikiCurrentEventsTitle,
} from 'common/news-feed'
import { HOUR_MS, MINUTE_MS } from 'common/util/time'
import { log } from 'shared/utils'

/**
 * Where stories come from.
 *
 * - Wikipedia's Current Events portal: 15 to 20 human-clustered stories a day,
 *   each a neutral sentence with its outlets linked (CC BY-SA; the sentence is
 *   shown with a credit).
 * - The GDELT Project's DOC API: the world's news within 15 minutes of
 *   publication as headline, link, outlet and time. Free for any use with a
 *   citation to the project, which the page carries. The headline and link
 *   are all we keep and all we show.
 * - Mediastack: a licensed headline feed (title, link, outlet, category and a
 *   standfirst we read but never show). Needs MEDIASTACK_API_KEY.
 * - Google News RSS: the prototype's wire. Its own notice allows personal use
 *   only, so it runs only when NEWS_SOURCES names it.
 */

export type RawStory = {
  origin: NewsStoryOrigin
  /** Stable across refreshes: the primary url, or the wiki sentence. */
  key: string
  headline: string
  /** A sentence or two of context that may be shown (the portal's bullet). */
  summary?: string
  /** A publisher's standfirst: read by the matcher, never shown or sent to
   * the page. */
  context?: string
  topic?: string
  category: NewsCategory
  publishedTime: number
  sources: NewsSourceLink[]
  /** Wikipedia article titles for what the story is about, for a picture. */
  entities?: string[]
}

/** Wikimedia asks bots to say who they are and how to reach them;
 * NEWS_FEED_CONTACT is that address. */
export const USER_AGENT = `ManifoldNewsFeed/0.3 (+https://manifold.markets/news${
  process.env.NEWS_FEED_CONTACT ? '; ' + process.env.NEWS_FEED_CONTACT : ''
})`

/** The licensed set: Wikipedia, GDELT, and Mediastack when its key is set.
 * Google News runs only when named. */
const DEFAULT_SOURCES = 'wikipedia,gdelt,mediastack'

/** NEWS_SOURCES picks the story sources (see the module comment). */
export function enabledSources(): NewsStoryOrigin[] {
  const raw = process.env.NEWS_SOURCES ?? DEFAULT_SOURCES
  const picked = uniq(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(isNewsStoryOrigin)
      .filter((s) => s !== 'mediastack' || !!process.env.MEDIASTACK_API_KEY)
  )
  return picked.length > 0 ? picked : ['wikipedia']
}

const FETCH_TIMEOUT_MS = 10_000
const MAX_REDIRECTS = 3

/** Which URLs a fetch may touch, redirects included. */
export type UrlCheck = (url: URL) => boolean

const PRIVATE_HOST =
  /^(localhost|.*\.local|.*\.internal|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|\[?::1\]?|\[?f[cd][0-9a-f]{2}:.*|\[?fe80:.*)$/i

/** Public https on the default port: no internal hosts, no IP-literal
 * private ranges. (A name that resolves to a private address still gets
 * through; production fetching belongs behind an egress proxy.) */
export const isPublicHttps: UrlCheck = (u) =>
  u.protocol === 'https:' && !u.port && !PRIVATE_HOST.test(u.hostname)

/** Some vendors take the key in the query string; keep it out of logs. */
export const redactUrl = (url: string) =>
  url.replace(/((?:access_key|api-key|apikey|key)=)[^&#]+/gi, '$1***')

export type HttpResponse = { status: number; body: string }

export type RequestOptions = {
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  /** JSON, sent as the body of a POST. */
  body?: string
  /** Which URLs the request may touch, redirects included. */
  allow?: UrlCheck
  timeoutMs?: number
}

/** One request over one IP family (0 lets the OS choose). Any status comes
 * back; only network failures reject. */
function httpsOnce(
  url: string,
  family: 0 | 4 | 6,
  opts: RequestOptions,
  redirects = 0
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const allow = opts.allow ?? isPublicHttps
    if (!allow(new URL(url))) {
      reject(new Error(`refusing to fetch ${redactUrl(url)}`))
      return
    }
    const method = opts.method ?? 'GET'
    const timeout = opts.timeoutMs ?? FETCH_TIMEOUT_MS
    // One options object plus callback: a dependency patches https.request
    // and mishandles the (url, options, callback) form.
    const req = https.request(
      {
        ...urlToHttpOptions(new URL(url)),
        method,
        family,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: '*/*',
          ...(opts.body
            ? {
                'Content-Type': 'application/json',
                'Content-Length': String(Buffer.byteLength(opts.body)),
              }
            : {}),
          ...opts.headers,
        },
        timeout,
      },
      (res) => {
        const status = res.statusCode ?? 0
        if (
          status >= 300 &&
          status < 400 &&
          res.headers.location &&
          method === 'GET'
        ) {
          res.resume()
          if (redirects >= MAX_REDIRECTS) {
            reject(new Error(`too many redirects for ${redactUrl(url)}`))
            return
          }
          // The next hop is checked like the first, so an allowed page
          // cannot bounce the server somewhere else.
          resolve(
            httpsOnce(
              new URL(res.headers.location, url).toString(),
              family,
              opts,
              redirects + 1
            )
          )
          return
        }
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () =>
          resolve({ status, body: Buffer.concat(chunks).toString('utf8') })
        )
        res.on('error', reject)
      }
    )
    req.on('timeout', () =>
      req.destroy(new Error(`timeout after ${timeout}ms for ${redactUrl(url)}`))
    )
    req.on('error', reject)
    if (opts.body) req.write(opts.body)
    req.end()
  })
}

/**
 * Make a request. Tries the OS's pick of address family, then IPv6, then
 * IPv4: on at least one dev box Wikipedia's IPv4 edge times out for Node
 * while IPv6 answers, and the global fetch gives up before trying it. An
 * HTTP error status is returned, not retried.
 */
export async function httpsRequest(
  url: string,
  opts: RequestOptions = {}
): Promise<HttpResponse> {
  const errors: string[] = []
  for (const family of [0, 6, 4] as const) {
    try {
      return await httpsOnce(url, family, opts)
    } catch (e) {
      errors.push(
        `${family || 'auto'}: ${e instanceof Error ? e.message : String(e)}`
      )
    }
  }
  throw new Error(`fetch failed for ${redactUrl(url)} (${errors.join('; ')})`)
}

export const isOk = (res: HttpResponse) => res.status >= 200 && res.status < 300

/** GET a URL as text; a non-2xx status is an error. */
export async function fetchText(url: string, allow: UrlCheck = isPublicHttps) {
  const res = await httpsRequest(url, { allow })
  if (!isOk(res)) throw new Error(`${res.status} for ${redactUrl(url)}`)
  return res.body
}

export const hostnameOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return undefined
  }
}

const AGGREGATOR_HOSTS = new Set(['news.google.com'])

/** True for links that bounce through an aggregator rather than the outlet. */
export const isAggregatorLink = (url: string) =>
  AGGREGATOR_HOSTS.has(hostnameOf(url) ?? '')

/** One link per outlet, first seen wins. Aggregator redirects all share a
 * host, so those dedupe by the outlet's name instead. */
export const dedupeSources = (sources: NewsSourceLink[]) =>
  uniqBy(
    sources.filter((s) => s.url && s.name),
    (s) =>
      isAggregatorLink(s.url)
        ? 'name:' + s.name.trim().toLowerCase()
        : hostnameOf(s.url) ?? s.url
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

/** Pages with these paths are not stories. */
const NON_ARTICLE_PATH =
  /\/(video|videos|live|av|audio|podcasts?|gallery|pictures|newsletters?)\//

// ---------------------------------------------------------------------------
// Outlets

/** The outlets the wire is drawn from, with the names the cards show. All
 * are on the favicon allowlist (Wikipedia's generally reliable sources). */
export const OUTLET_NAMES: Record<string, string> = {
  'bbc.com': 'BBC News',
  'bbc.co.uk': 'BBC News',
  'reuters.com': 'Reuters',
  'apnews.com': 'AP News',
  'cnn.com': 'CNN',
  'nbcnews.com': 'NBC News',
  'cbsnews.com': 'CBS News',
  'abcnews.go.com': 'ABC News',
  'theguardian.com': 'The Guardian',
  'politico.com': 'Politico',
  'thehill.com': 'The Hill',
  'cnbc.com': 'CNBC',
  'bloomberg.com': 'Bloomberg',
  'wsj.com': 'The Wall Street Journal',
  'nytimes.com': 'The New York Times',
  'washingtonpost.com': 'The Washington Post',
  'npr.org': 'NPR',
  'axios.com': 'Axios',
  'aljazeera.com': 'Al Jazeera',
  'ft.com': 'Financial Times',
  'economist.com': 'The Economist',
  'usatoday.com': 'USA Today',
  'latimes.com': 'Los Angeles Times',
  'foxnews.com': 'Fox News',
  'time.com': 'TIME',
  'theatlantic.com': 'The Atlantic',
  'independent.co.uk': 'The Independent',
  'telegraph.co.uk': 'The Telegraph',
  'thetimes.co.uk': 'The Times',
  'forbes.com': 'Forbes',
  'businessinsider.com': 'Business Insider',
  'vox.com': 'Vox',
  'newsweek.com': 'Newsweek',
  'scmp.com': 'South China Morning Post',
  'arstechnica.com': 'Ars Technica',
  'wired.com': 'Wired',
  'newscientist.com': 'New Scientist',
  'nature.com': 'Nature',
  'variety.com': 'Variety',
  'hollywoodreporter.com': 'The Hollywood Reporter',
  'deadline.com': 'Deadline',
}

/** The display name for an outlet's host, when it is one we know. */
export const outletName = (host: string | undefined) => {
  if (!host) return undefined
  const h = host.replace(/^www\./, '')
  for (const [domain, name] of Object.entries(OUTLET_NAMES))
    if (h === domain || h.endsWith('.' + domain)) return name
  return undefined
}

/** "cnn" or "cnn.com" as a name, when nothing better is known. */
const prettyHost = (host: string) => {
  const label = host.replace(/^www\./, '').split('.')[0]
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : host
}

// ---------------------------------------------------------------------------
// Wikipedia: Portal:Current events/<year> <Month> <day>

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
const WIKI_LINK_RE = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g

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

/** Dates and years are linked in every bullet and picture nothing. */
const NOT_A_SUBJECT =
  /^(\d{4}|\d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December)|(January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2})$/

/** The articles a bullet links, in order: what the story is about. */
const wikiLinkTargets = (wikitext: string) => {
  const targets: string[] = []
  for (const m of wikitext.matchAll(WIKI_LINK_RE)) {
    const target = m[1].trim()
    if (!target || target.includes(':') || NOT_A_SUBJECT.test(target)) continue
    targets.push(target)
  }
  return uniq(targets)
}

/** The portal bullets are a sentence or two; the headline is the text
itself, cut at a word if it runs long. Sentence splitting is unreliable
because of abbreviations such as "U.S.". */
const headlineOf = (text: string) => {
  if (text.length <= 150) return text
  const cut = text.slice(0, 150)
  const at = cut.lastIndexOf(' ')
  return (at > 80 ? cut.slice(0, at) : cut).trimEnd() + '…'
}

/** Parses one day's portal page into stories: the deepest bullets that cite
 * a source, with their parent bullets as the topic. */
export function parseWikiCurrentEvents(wikitext: string, day: Date) {
  const stories: RawStory[] = []
  let category: NewsCategory = 'other'
  const parents: string[] = []
  const parentLinks: string[][] = []
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
      parentLinks.length = 0
      continue
    }
    const m = line.match(/^(\*+)(.*)$/)
    if (!m) continue
    const depth = m[1].length
    const body = m[2].trim()
    parents.length = depth - 1
    parentLinks.length = depth - 1
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
      parentLinks[depth - 1] = wikiLinkTargets(body)
      continue
    }
    const topic = parents.filter(Boolean).slice(-2).join(' · ') || undefined
    // The bullet's own links first, then the running story's.
    const entities = uniq([
      ...wikiLinkTargets(body),
      ...parentLinks.flat().reverse(),
    ])
    stories.push({
      origin: 'wikipedia',
      key: text,
      headline: headlineOf(text),
      summary: text,
      topic,
      category,
      publishedTime: base + stories.length * 60_000,
      sources: dedupeSources(sources),
      entities: entities.length > 0 ? entities : undefined,
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
// GDELT DOC 2.0: https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
//
// Free for any use with a citation to the project. The API wants one request
// every five seconds from a client and refuses long queries, so the wire is
// drawn with several short "beat" queries over a dozen outlets, run well
// apart. A query must search for something; the verifier settles each
// story's category afterwards.

const GDELT_API = 'https://api.gdeltproject.org/api/v2/doc/doc'
/** The API asks for five seconds between requests and counts generously. */
const GDELT_GAP_MS = 10_000
/** Records per query (the API's maximum). */
const GDELT_MAX_RECORDS = 250
/** How far back a cold start looks. */
const GDELT_COLD_WINDOW_MS = 6 * HOUR_MS
const GDELT_MIN_WINDOW_MS = 30 * MINUTE_MS

/** The outlets the GDELT queries are restricted to: a dozen, because a query
 * has a length limit. All are in OUTLET_NAMES. */
export const GDELT_DOMAINS = [
  'bbc.com',
  'reuters.com',
  'apnews.com',
  'cnn.com',
  'nbcnews.com',
  'cbsnews.com',
  'theguardian.com',
  'politico.com',
  'cnbc.com',
  'npr.org',
  'axios.com',
  'thehill.com',
]

/** Each beat is one query; together they cover the news a market could turn
 * on. The terms are broad on purpose: the matcher decides relevance. */
export const GDELT_BEATS: string[][] = [
  [
    'election',
    'senate',
    'congress',
    'president',
    'governor',
    'parliament',
    'prime minister',
    'supreme court',
  ],
  [
    'ukraine',
    'russia',
    'israel',
    'gaza',
    'iran',
    'china',
    'taiwan',
    'nato',
    'ceasefire',
    'sanctions',
  ],
  [
    'federal reserve',
    'inflation',
    'tariffs',
    'stocks',
    'earnings',
    'gdp',
    'unemployment',
    'oil prices',
    'bitcoin',
  ],
  [
    'openai',
    'nvidia',
    'apple',
    'google',
    'microsoft',
    'tesla',
    'spacex',
    'artificial intelligence',
    'nasa',
    'vaccine',
    'climate',
    'hurricane',
  ],
  [
    'nfl',
    'nba',
    'mlb',
    'nhl',
    'world series',
    'super bowl',
    'premier league',
    'champions league',
    'formula 1',
    'ufc',
    'olympics',
    'world cup',
  ],
  [
    'box office',
    'oscars',
    'grammys',
    'netflix',
    'album',
    'emmys',
    'billboard',
    'festival',
    'poll',
    'strike',
    'verdict',
    'merger',
  ],
]

/** GDELT_SCOPE=any drops the outlet filter from the query (the allowlist
 * still applies to what comes back). */
const gdeltQuery = (terms: string[]) => {
  const quoted = terms.map((t) => (t.includes(' ') ? `"${t}"` : t))
  const outlets =
    process.env.GDELT_SCOPE === 'any'
      ? ''
      : ` (${GDELT_DOMAINS.map((d) => `domain:${d}`).join(' OR ')})`
  return `(${quoted.join(' OR ')})${outlets} sourcelang:english`
}

type GdeltArticle = {
  url?: string
  url_mobile?: string
  title?: string
  /** YYYYMMDDTHHMMSSZ */
  seendate?: string
  socialimage?: string
  domain?: string
  language?: string
  sourcecountry?: string
}

const parseSeenDate = (s: string | undefined) => {
  const m = s?.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/)
  if (!m) return undefined
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
}

/** Outlets append their name to page titles ("… - BBC News", "… | CNN");
 * take it off when the tail is the outlet. */
export const stripOutletSuffix = (title: string, host: string | undefined) => {
  const m = title.match(/^(.*\S)\s+[-|–—:]\s+([^-|–—:]{2,40})$/)
  if (!m) return title.trim()
  const tail = m[2].trim().toLowerCase()
  const names = [
    outletName(host),
    host?.replace(/^www\./, ''),
    host?.replace(/^www\./, '').split('.')[0],
  ]
    .filter((n): n is string => !!n)
    .map((n) => n.toLowerCase())
  const isOutlet = names.some(
    (n) => tail === n || tail === n + ' news' || n.startsWith(tail)
  )
  return isOutlet ? m[1].trim() : title.trim()
}

export function parseGdelt(json: string, fetchedAt: number): RawStory[] {
  const parsed = JSON.parse(json) as { articles?: GdeltArticle[] }
  const stories: RawStory[] = []
  for (const a of parsed.articles ?? []) {
    if (!a.url || !a.title || !/^https:\/\//.test(a.url)) continue
    if (a.language && a.language !== 'English') continue
    const host = hostnameOf(a.url)
    if (!host || !isFaviconAllowed(host) || NON_ARTICLE_PATH.test(a.url))
      continue
    const headline = stripOutletSuffix(decodeEntities(a.title), host)
    if (headline.length < 20) continue
    stories.push({
      origin: 'gdelt',
      key: a.url,
      headline,
      category: 'other',
      publishedTime: parseSeenDate(a.seendate) ?? fetchedAt,
      sources: [
        {
          name: outletName(host) ?? prettyHost(host),
          url: a.url,
          site: `https://${host}`,
        },
      ],
    })
  }
  return uniqBy(stories, (s) => s.key)
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** The wire since the last refresh (or the last few hours on a cold start),
 * one beat at a time. A throttled or failed query is logged and skipped. */
export async function fetchGdelt(now = Date.now(), since?: number) {
  const windowMs = since
    ? Math.min(
        GDELT_COLD_WINDOW_MS,
        Math.max(GDELT_MIN_WINDOW_MS, now - since + 20 * MINUTE_MS)
      )
    : GDELT_COLD_WINDOW_MS
  const timespan = `${Math.ceil(windowMs / MINUTE_MS)}min`
  const stories: RawStory[] = []
  let dropped = 0
  let refused = 0
  for (const [i, beat] of GDELT_BEATS.entries()) {
    if (i > 0) await pause(GDELT_GAP_MS)
    const query = gdeltQuery(beat)
    const params = new URLSearchParams({
      query,
      mode: 'artlist',
      maxrecords: String(GDELT_MAX_RECORDS),
      format: 'json',
      timespan,
      sort: 'datedesc',
    })
    try {
      const res = await httpsRequest(`${GDELT_API}?${params}`, {
        allow: (u) =>
          u.protocol === 'https:' && u.hostname === 'api.gdeltproject.org',
        timeoutMs: 30_000,
      })
      const body = res.body.trim()
      if (!isOk(res) || !body.startsWith('{')) {
        refused++
        log.warn('news-feed: gdelt query refused', {
          beat: i,
          status: res.status,
          queryLength: query.length,
          body: body.slice(0, 120),
        })
        continue
      }
      const total = (JSON.parse(body) as { articles?: unknown[] }).articles
        ?.length
      const kept = parseGdelt(body, now)
      dropped += (total ?? 0) - kept.length
      stories.push(...kept)
    } catch (e) {
      refused++
      log.warn('news-feed: gdelt query failed', {
        beat: i,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }
  const out = uniqBy(stories, (s) => s.key)
  log('news-feed: gdelt', {
    timespan,
    beats: GDELT_BEATS.length,
    refused,
    stories: out.length,
    dropped,
    outlets: Object.keys(
      countBy(out, (s) => hostnameOf(s.sources[0].url) ?? '')
    ).length,
  })
  return out
}

// ---------------------------------------------------------------------------
// Mediastack: https://mediastack.com (an apilayer product). Licensed headline
// feed on the paid plans (the free plan is non-commercial, delayed and HTTP
// only). We keep the title, link, outlet and category; the standfirst is read
// by the matcher and never shown.

const MEDIASTACK_API = 'https://api.mediastack.com/v1/news'
const MEDIASTACK_CATEGORY: Record<string, NewsCategory> = {
  general: 'other',
  business: 'economy',
  entertainment: 'culture',
  health: 'science',
  science: 'science',
  sports: 'sport',
  technology: 'tech',
}

type MediastackItem = {
  author?: string | null
  title?: string
  description?: string | null
  url?: string
  source?: string
  image?: string | null
  category?: string
  language?: string
  country?: string
  published_at?: string
}

type MediastackResponse = {
  pagination?: { limit?: number; offset?: number; count?: number }
  data?: MediastackItem[]
  error?: { code?: string; message?: string }
}

export function parseMediastack(json: string, fetchedAt: number) {
  const parsed = JSON.parse(json) as MediastackResponse
  if (parsed.error)
    throw new Error(
      `mediastack: ${parsed.error.code ?? ''} ${
        parsed.error.message ?? ''
      }`.trim()
    )
  const anyOutlet = process.env.MEDIASTACK_ANY_OUTLET === 'true'
  const stories: RawStory[] = []
  let dropped = 0
  for (const item of parsed.data ?? []) {
    const url = item.url?.split('#')[0]
    if (!url || !item.title || !/^https:\/\//.test(url)) continue
    const host = hostnameOf(url)
    if (!host || NON_ARTICLE_PATH.test(url)) continue
    if (!anyOutlet && !isFaviconAllowed(host)) {
      dropped++
      continue
    }
    const published = Date.parse(item.published_at ?? '')
    const context = item.description?.replace(/\s+/g, ' ').trim()
    stories.push({
      origin: 'mediastack',
      key: url,
      headline: stripOutletSuffix(decodeEntities(item.title), host),
      context: context ? context.slice(0, 400) : undefined,
      category: MEDIASTACK_CATEGORY[item.category ?? ''] ?? 'other',
      publishedTime: Number.isFinite(published) ? published : fetchedAt,
      sources: [
        {
          name:
            outletName(host) ??
            (item.source ? prettyHost(item.source) : prettyHost(host)),
          url,
          site: `https://${host}`,
        },
      ],
    })
  }
  return {
    stories: uniqBy(stories, (s) => s.key),
    dropped,
    count: parsed.data?.length ?? 0,
  }
}

/**
 * The newest English stories from US and UK outlets, one page of 100 per
 * call (MEDIASTACK_PAGES for more; the Standard plan has 10,000 calls a
 * month and a refresh every 10 minutes uses about 4,300). MEDIASTACK_SOURCES
 * passes the plan's source filter through; MEDIASTACK_COUNTRIES the
 * countries.
 */
export async function fetchMediastack(now = Date.now()) {
  const key = process.env.MEDIASTACK_API_KEY
  if (!key) return [] as RawStory[]
  const pages = Math.min(
    5,
    Math.max(1, Math.floor(Number(process.env.MEDIASTACK_PAGES ?? '1')) || 1)
  )
  const stories: RawStory[] = []
  let dropped = 0
  for (let page = 0; page < pages; page++) {
    const params = new URLSearchParams({
      access_key: key,
      languages: 'en',
      countries: process.env.MEDIASTACK_COUNTRIES ?? 'us,gb',
      sort: 'published_desc',
      limit: '100',
      offset: String(page * 100),
    })
    if (process.env.MEDIASTACK_SOURCES)
      params.set('sources', process.env.MEDIASTACK_SOURCES)
    const body = await fetchText(
      `${MEDIASTACK_API}?${params}`,
      (u) => u.protocol === 'https:' && u.hostname === 'api.mediastack.com'
    )
    const parsed = parseMediastack(body, now)
    stories.push(...parsed.stories)
    dropped += parsed.dropped
    if (parsed.count < 100) break
  }
  const out = uniqBy(stories, (s) => s.key)
  log('news-feed: mediastack', {
    stories: out.length,
    dropped,
    pages,
    outlets: Object.keys(
      countBy(out, (s) => hostnameOf(s.sources[0].url) ?? '')
    ).length,
  })
  return out
}

// ---------------------------------------------------------------------------
// Google News RSS (prototype only: personal-use feed)

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
        site: sourceUrl,
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
  // Section feeds repeat the top stories; the first keeps the item and a
  // section's category replaces the top feed's 'other'.
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

// ---------------------------------------------------------------------------

/** Everything the feed reads, in one call. Failures are logged, not thrown:
 * a dead source should not blank the page. `since` is the previous build's
 * time, so the wire asks only for what is new. */
export async function gatherRawStories(
  now = Date.now(),
  opts: { since?: number } = {}
) {
  const day = 24 * 60 * 60 * 1000
  const days = [0, 1, 2].map((d) => new Date(now - d * day))
  const sources = enabledSources()
  const guarded = (name: string, p: Promise<RawStory[]>) =>
    p.catch((e) => {
      log.error(`news-feed: ${name} failed`, { error: String(e) })
      return [] as RawStory[]
    })
  const [wiki, ...rest] = await Promise.all([
    sources.includes('wikipedia')
      ? Promise.allSettled(days.map((d) => fetchWikipediaCurrentEvents(d)))
      : ([] as PromiseSettledResult<RawStory[]>[]),
    sources.includes('gdelt')
      ? guarded('gdelt', fetchGdelt(now, opts.since))
      : ([] as RawStory[]),
    sources.includes('mediastack')
      ? guarded('mediastack', fetchMediastack(now))
      : ([] as RawStory[]),
    sources.includes('google-news')
      ? guarded('google news', fetchGoogleNews(now))
      : ([] as RawStory[]),
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
  for (const list of rest) stories.push(...list)
  return stories
}
