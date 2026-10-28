import { uniq, uniqBy } from 'lodash'
import {
  isNewsArticleSource,
  NewsArticle,
  NewsArticleSource,
} from 'common/news-feed'
import { mapAsync } from 'common/util/promise'
import { DAY_MS } from 'common/util/time'
import { log } from 'shared/utils'
import {
  fetchText,
  hostnameOf,
  httpsRequest,
  isOk,
  isPublicHttps,
  outletName,
  USER_AGENT,
} from './sources'

/**
 * Full article text, which claims are read from.
 *
 * Licensed routes:
 * - The Guardian's Open Platform under a commercial key: its search returns
 *   the body as plain text. The developer key is non-commercial and bars
 *   machine-learning use, so it is not a way to try this.
 * - TollBit: a one-time partial-use licence per article at the publisher's
 *   rate, for pages of publishers in its network, found through the story's
 *   own links or TollBit's licensed search.
 * Prototype-only routes, off unless NEWS_ARTICLE_SOURCES names them:
 * - GNews search, whose `content` is text it does not own.
 * - A few outlets' public RSS feeds and their article pages, whose terms
 *   forbid it.
 * Whatever the route, the feed shows only short attributed excerpts with a
 * link.
 */

export type IndexedArticle = NewsArticle & {
  description?: string
  provider: NewsArticleSource
  /** The body, when the provider returns it with the search. */
  text?: string
  /** Found among the story's own links rather than in an index, so the
   * title is the story's, not the outlet's, until the page is read. */
  ownLink?: boolean
  /** What TollBit quoted for reading it, in micros of a dollar. */
  priceMicros?: number
}

/** NEWS_ARTICLE_SOURCES: a comma list of guardian, tollbit, gnews, rss, or
 * none. Default 'guardian,tollbit'; an API source counts only with its key
 * set, and 'rss' (outlet pages, prototype only) only when named. */
export function articleSources(): NewsArticleSource[] {
  const raw = (process.env.NEWS_ARTICLE_SOURCES ?? 'guardian,tollbit').trim()
  if (!raw || raw === 'none') return []
  const keyFor: Record<NewsArticleSource, string | undefined> = {
    guardian: process.env.GUARDIAN_API_KEY,
    tollbit: process.env.TOLLBIT_API_KEY,
    gnews: process.env.GNEWS_API_KEY,
    rss: 'no key needed',
  }
  return uniq(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(isNewsArticleSource)
      .filter((s) => !!keyFor[s])
  )
}

export const hasArticleSource = (s: NewsArticleSource) =>
  articleSources().includes(s)

type Outlet = {
  publisher: string
  site: string
  hosts: string[]
  feeds: string[]
}

/** Outlets whose public feeds and pages the prototype reads ('rss'). */
export const ARTICLE_OUTLETS: Outlet[] = [
  {
    publisher: 'BBC News',
    site: 'https://www.bbc.com',
    hosts: ['bbc.co.uk', 'bbc.com'],
    feeds: [
      'https://feeds.bbci.co.uk/news/world/rss.xml',
      'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml',
      'https://feeds.bbci.co.uk/news/business/rss.xml',
      'https://feeds.bbci.co.uk/news/technology/rss.xml',
      'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml',
    ],
  },
  {
    publisher: 'The Guardian',
    site: 'https://www.theguardian.com',
    hosts: ['theguardian.com'],
    feeds: [
      'https://www.theguardian.com/world/rss',
      'https://www.theguardian.com/us-news/rss',
      'https://www.theguardian.com/politics/rss',
      'https://www.theguardian.com/uk/business/rss',
      'https://www.theguardian.com/uk/technology/rss',
    ],
  },
  {
    publisher: 'Al Jazeera',
    site: 'https://www.aljazeera.com',
    hosts: ['aljazeera.com'],
    feeds: ['https://www.aljazeera.com/xml/rss/all.xml'],
  },
  {
    publisher: 'CNBC',
    site: 'https://www.cnbc.com',
    hosts: ['cnbc.com'],
    feeds: [
      'https://www.cnbc.com/id/100003114/device/rss/rss.html',
      'https://www.cnbc.com/id/10000113/device/rss/rss.html',
      'https://www.cnbc.com/id/20910258/device/rss/rss.html',
    ],
  },
  {
    publisher: 'CBS News',
    site: 'https://www.cbsnews.com',
    hosts: ['cbsnews.com'],
    feeds: [
      'https://www.cbsnews.com/latest/rss/main',
      'https://www.cbsnews.com/latest/rss/politics',
      'https://www.cbsnews.com/latest/rss/world',
    ],
  },
  {
    publisher: 'NBC News',
    site: 'https://www.nbcnews.com',
    hosts: ['nbcnews.com'],
    feeds: [
      'https://feeds.nbcnews.com/nbcnews/public/news',
      'https://feeds.nbcnews.com/nbcnews/public/politics',
      'https://feeds.nbcnews.com/nbcnews/public/world',
    ],
  },
  {
    publisher: 'Fox News',
    site: 'https://www.foxnews.com',
    hosts: ['foxnews.com'],
    feeds: [
      'https://moxie.foxnews.com/google-publisher/latest.xml',
      'https://moxie.foxnews.com/google-publisher/politics.xml',
      'https://moxie.foxnews.com/google-publisher/world.xml',
    ],
  },
]

const INDEX_WINDOW_MS = 3 * DAY_MS
const FEED_CONCURRENCY = 4
/** Bodies shorter than this are teasers or blocked pages. */
const MIN_BODY_WORDS = 150
/** The extractor's prompt only needs the first part of a long article. */
const MAX_BODY_CHARS = 16_000
/** Pages with these paths are not articles we can quote. */
const NON_ARTICLE_PATH =
  /\/(video|videos|live|av|audio|podcasts?|gallery|pictures)\//

const outletForHost = (host: string | undefined) =>
  host
    ? ARTICLE_OUTLETS.find((o) =>
        o.hosts.some((h) => host === h || host.endsWith('.' + h))
      )
    : undefined

/** The outlet behind a URL, when it is one whose pages the prototype reads. */
export const readableOutlet = (url: string) => outletForHost(hostnameOf(url))

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCharCode(parseInt(n, 16))
    )
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')

const stripTags = (s: string) =>
  decode(s.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length

const STOPWORDS = new Set(
  `the a an and or but of to in on at for with by from as is are was were be been it its this that these those after before over under into about amid how why what when who where which says say said new will would could should may might has have had not no vs up down out off than more most less least first last us his her their he she they we you i one two three`.split(
    ' '
  )
)

/** The words of a headline worth searching for, in order. */
export const searchTerms = (headline: string, max: number) =>
  uniq(
    headline
      .toLowerCase()
      .replace(/[’']s\b/g, '')
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
  ).slice(0, max)

function parseFeedItems(xml: string, outlet: Outlet, now: number) {
  const out: IndexedArticle[] = []
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/g)) {
    const block = m[0]
    const tag = (t: string) => {
      const x = block.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)<\\/${t}>`))
      return x ? decode(x[1]).trim() : undefined
    }
    const link = (tag('link') ?? tag('guid'))?.split('?')[0]
    const title = tag('title')
    if (!link || !title || !/^https:\/\//.test(link)) continue
    if (!outletForHost(hostnameOf(link)) || NON_ARTICLE_PATH.test(link))
      continue
    const published = Date.parse(tag('pubDate') ?? '')
    if (!Number.isFinite(published) || now - published > INDEX_WINDOW_MS)
      continue
    const image =
      block.match(/<media:(?:thumbnail|content)[^>]*url="([^"]+)"/)?.[1] ??
      block.match(/<enclosure[^>]*url="([^"]+)"[^>]*type="image/)?.[1]
    const description = tag('description')
    out.push({
      url: link,
      title: stripTags(title),
      description: description ? stripTags(description) : undefined,
      publisher: outlet.publisher,
      site: outlet.site,
      publishedTime: published,
      image: image && /^https:\/\//.test(image) ? decode(image) : undefined,
      provider: 'rss',
    })
  }
  return out
}

/** Recent articles from the outlets the prototype reads, newest first.
 * Empty unless 'rss' is an article source. */
export async function fetchArticleIndex(now = Date.now()) {
  if (!hasArticleSource('rss')) return [] as IndexedArticle[]
  const jobs = ARTICLE_OUTLETS.flatMap((outlet) =>
    outlet.feeds.map((url) => ({ outlet, url }))
  )
  const results = await mapAsync(
    jobs,
    async ({ outlet, url }) => {
      try {
        return parseFeedItems(await fetchText(url), outlet, now)
      } catch (e) {
        log.warn('news-feed: article feed failed', {
          url,
          error: e instanceof Error ? e.message : String(e),
        })
        return [] as IndexedArticle[]
      }
    },
    FEED_CONCURRENCY
  )
  return uniqBy(results.flat(), (a) => a.url).sort(
    (a, b) => b.publishedTime - a.publishedTime
  )
}

/** The body text of an article page: the NewsArticle JSON-LD body when the
 * page has one, else the paragraphs inside <article>, else the page's. */
export function extractArticleBody(html: string) {
  let text: string | undefined
  for (const m of html.matchAll(
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g
  )) {
    try {
      const parsed = JSON.parse(m[1]) as unknown
      const stack: unknown[] = Array.isArray(parsed) ? [...parsed] : [parsed]
      while (stack.length && !text) {
        const o = stack.pop()
        if (!o || typeof o !== 'object') continue
        const rec = o as Record<string, unknown>
        if (typeof rec.articleBody === 'string' && rec.articleBody.length > 400)
          text = stripTags(rec.articleBody)
        if (Array.isArray(rec['@graph'])) stack.push(...rec['@graph'])
      }
    } catch {
      // Not JSON we can read; try the next block.
    }
    if (text) break
  }
  if (!text) {
    const article = html.match(/<article[\s\S]*?<\/article>/)?.[0]
    const paragraphs = (scope: string) =>
      [...scope.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
        .map((p) => stripTags(p[1]))
        .filter((p) => p.length > 40)
    const fromArticle = article ? paragraphs(article) : []
    text = (fromArticle.length >= 3 ? fromArticle : paragraphs(html)).join(
      '\n\n'
    )
  }
  const meta = (property: string) =>
    html.match(
      new RegExp(`<meta[^>]+property="${property}"[^>]+content="([^"]+)"`)
    )?.[1]
  const image = meta('og:image')
  const title = meta('og:title')
  return {
    text: text.slice(0, MAX_BODY_CHARS),
    words: wordCount(text),
    image: image && /^https:\/\//.test(image) ? decode(image) : undefined,
    title: title ? stripTags(title) : undefined,
  }
}

export type ArticleBody = {
  text: string
  image?: string
  title?: string
  byline?: string
  /** What the read cost, when a licence was bought for it. */
  priceMicros?: number
}

/** The text of an article, by its provider's route. Undefined when the body
 * is too short to be the article (a teaser or a blocked page). */
export async function readArticle(
  article: IndexedArticle
): Promise<ArticleBody | undefined> {
  if (article.text) {
    return wordCount(article.text) >= MIN_BODY_WORDS
      ? { text: article.text.slice(0, MAX_BODY_CHARS), byline: article.byline }
      : undefined
  }
  if (article.provider === 'tollbit') {
    const got = await readTollbit(article.url)
    if (!got || wordCount(got.text) < MIN_BODY_WORDS) return undefined
    return {
      text: got.text.slice(0, MAX_BODY_CHARS),
      title: got.title,
      byline: got.author,
      priceMicros: got.priceMicros,
    }
  }
  if (
    article.provider !== 'rss' ||
    !hasArticleSource('rss') ||
    !readableOutlet(article.url)
  )
    return undefined
  const html = await fetchText(
    article.url,
    (u) => isPublicHttps(u) && !!readableOutlet(u.toString())
  )
  const body = extractArticleBody(html)
  if (body.words < MIN_BODY_WORDS) return undefined
  return { text: body.text, image: body.image, title: body.title }
}

// ---------------------------------------------------------------------------
// The Guardian Open Platform: https://open-platform.theguardian.com
//
// Full text comes with the search under a commercial key (price on usage;
// the commercial tier lists AI and text-and-data-mining use among what it
// covers, so the extraction we do goes in the contract). Display terms: link
// to the article, headline and byline unaltered, "Powered by The Guardian"
// on the page, and the text refreshed or dropped within 24 hours, which
// claims.ts does by reading the article again after a day.

const GUARDIAN_API = 'https://content.guardianapis.com/search'
const onlyGuardian = (u: URL) =>
  u.protocol === 'https:' && u.hostname === 'content.guardianapis.com'

type GuardianResult = {
  id?: string
  webTitle?: string
  webUrl?: string
  webPublicationDate?: string
  fields?: {
    headline?: string
    trailText?: string
    byline?: string
    bodyText?: string
    thumbnail?: string
    wordcount?: string
  }
}

/** Guardian articles on a headline around a time, with their full text.
 * Shaped from the documented response; untested without a key. */
export async function searchGuardian(
  headline: string,
  aroundTime: number
): Promise<IndexedArticle[]> {
  const key = process.env.GUARDIAN_API_KEY
  if (!key) return []
  const terms = searchTerms(headline, 4)
  if (terms.length < 2) return []
  const day = (t: number) => new Date(t).toISOString().slice(0, 10)
  const params = new URLSearchParams({
    q: terms.join(' AND '),
    'from-date': day(aroundTime - 2 * DAY_MS),
    'to-date': day(aroundTime + DAY_MS),
    'order-by': 'relevance',
    'page-size': '5',
    'show-fields': 'headline,trailText,byline,bodyText,wordcount',
    'api-key': key,
  })
  const raw = await fetchText(`${GUARDIAN_API}?${params}`, onlyGuardian)
  const parsed = JSON.parse(raw) as {
    response?: { status?: string; message?: string; results?: GuardianResult[] }
  }
  if (parsed.response?.status !== 'ok')
    throw new Error(
      `guardian: ${
        parsed.response?.message ?? parsed.response?.status ?? 'bad response'
      }`
    )
  return (parsed.response.results ?? []).flatMap((r): IndexedArticle[] => {
    const published = Date.parse(r.webPublicationDate ?? '')
    const text = r.fields?.bodyText?.trim()
    if (!r.webUrl || !r.webTitle || !Number.isFinite(published) || !text)
      return []
    return [
      {
        url: r.webUrl,
        title: r.fields?.headline ?? r.webTitle,
        description: r.fields?.trailText
          ? stripTags(r.fields.trailText)
          : undefined,
        publisher: 'The Guardian',
        site: 'https://www.theguardian.com',
        publishedTime: published,
        byline: r.fields?.byline,
        provider: 'guardian',
        text,
      },
    ]
  })
}

// ---------------------------------------------------------------------------
// TollBit: https://docs.tollbit.com
//
// Publishers in TollBit's network set a rate per page. A one-time
// ON_DEMAND_LICENSE (partial use: a summary, grounding or citation of the
// article) is bought per read, in micros of a dollar: rates for the URL, a
// content token under a price cap, then the page as markdown. Reads are
// capped per day (TOLLBIT_READS_PER_DAY) and per page (TOLLBIT_MAX_PRICE_USD).

const tollbitBase = () =>
  process.env.TOLLBIT_API_BASE ?? 'https://gateway.tollbit.com'
const onlyTollbit = (u: URL) =>
  u.protocol === 'https:' && u.hostname === new URL(tollbitBase()).hostname
const tollbitKey = () => process.env.TOLLBIT_API_KEY
/** The AgentID registered on the TollBit dashboard, which the User-Agent
 * of every content request must carry. */
const tollbitAgent = () => process.env.TOLLBIT_AGENT_ID ?? USER_AGENT
const tollbitMaxPriceMicros = () =>
  Math.max(
    0,
    Math.round(Number(process.env.TOLLBIT_MAX_PRICE_USD ?? '0.02') * 1_000_000)
  )
const tollbitReadsPerDay = () =>
  Math.max(0, Number(process.env.TOLLBIT_READS_PER_DAY ?? '150') || 0)

type TollbitRate = {
  price?: { priceMicros?: number | string; currency?: string }
  license?: {
    id?: string
    licenseType?: string
    licensePath?: string
    permissions?: { name?: string }[]
  }
}

/** What is spent today, for the budget and the log. In-process only. */
const tollbitSpend = { day: '', reads: 0, micros: 0 }

const today = () => new Date().toISOString().slice(0, 10)

const spendToday = () => {
  if (tollbitSpend.day !== today()) {
    tollbitSpend.day = today()
    tollbitSpend.reads = 0
    tollbitSpend.micros = 0
  }
  return tollbitSpend
}

/** Whether another TollBit read fits today's budget. */
export const canReadTollbit = () =>
  !!tollbitKey() && spendToday().reads < tollbitReadsPerDay()

/** The cheapest one-time licence a publisher offers for a page, in micros,
 * when it is within our cap. */
const priceOf = (rates: TollbitRate[]) => {
  let best: number | undefined
  for (const r of rates) {
    const type = r.license?.licenseType
    if (type !== 'ON_DEMAND_LICENSE' && type !== 'ON_DEMAND_FULL_USE_LICENSE')
      continue
    if (r.price?.currency && r.price.currency !== 'USD') continue
    const p = Number(r.price?.priceMicros)
    if (!Number.isFinite(p) || p < 0) continue
    if (best === undefined || p < best) best = p
  }
  return best !== undefined && best <= tollbitMaxPriceMicros()
    ? best
    : undefined
}

/** The URLs among these that TollBit licenses within our cap, with the
 * price of each. Rates are free to ask for. */
export async function tollbitRates(
  urls: string[]
): Promise<Map<string, number>> {
  const key = tollbitKey()
  const out = new Map<string, number>()
  if (!key || urls.length === 0) return out
  const res = await httpsRequest(`${tollbitBase()}/dev/v2/rates/batch`, {
    method: 'POST',
    headers: { TollbitKey: key },
    body: JSON.stringify({ urls }),
    allow: onlyTollbit,
  })
  if (!isOk(res))
    throw new Error(`tollbit rates: ${res.status} ${res.body.slice(0, 160)}`)
  const parsed = JSON.parse(res.body) as unknown
  const rows = Array.isArray(parsed)
    ? (parsed as { url?: string; rates?: TollbitRate[] }[])
    : (parsed as { results?: { url?: string; rates?: TollbitRate[] }[] })
        .results ?? []
  for (const row of rows) {
    const price = priceOf(row.rates ?? [])
    if (row.url && price !== undefined) out.set(row.url, price)
  }
  return out
}

/** Markdown as the plain text the claim reader wants. */
const markdownToText = (md: string) =>
  md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+>]\s+/gm, '')
    .replace(/[*_~`]+/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

/** Read one page through TollBit, buying its one-time licence. */
export async function readTollbit(url: string): Promise<
  | {
      text: string
      title?: string
      author?: string
      published?: number
      priceMicros?: number
    }
  | undefined
> {
  const key = tollbitKey()
  if (!key || !canReadTollbit()) return undefined
  const tokenRes = await httpsRequest(
    `${tollbitBase()}/dev/v2/tokens/content`,
    {
      method: 'POST',
      headers: { TollbitKey: key },
      body: JSON.stringify({
        url,
        userAgent: tollbitAgent(),
        maxPriceMicros: tollbitMaxPriceMicros(),
        currency: 'USD',
        licenseType: 'ON_DEMAND_LICENSE',
      }),
      allow: onlyTollbit,
    }
  )
  if (!isOk(tokenRes))
    throw new Error(
      `tollbit token: ${tokenRes.status} ${tokenRes.body.slice(0, 160)}`
    )
  const token = (JSON.parse(tokenRes.body) as { token?: string }).token
  if (!token) throw new Error('tollbit token: none in the response')
  const res = await httpsRequest(
    `${tollbitBase()}/dev/v2/content/${encodeURIComponent(url)}`,
    {
      headers: {
        // The docs name the header both ways.
        TollbitToken: token,
        'Tollbit-Token': token,
        'User-Agent': tollbitAgent(),
        'Tollbit-Accept-Content': 'text/markdown',
        Accept: 'text/markdown',
      },
      allow: onlyTollbit,
      timeoutMs: 20_000,
    }
  )
  if (!isOk(res))
    throw new Error(`tollbit content: ${res.status} ${res.body.slice(0, 160)}`)
  const parsed = JSON.parse(res.body) as {
    content?: { body?: string }
    metadata?: { title?: string; author?: string; published?: string }
    rate?: TollbitRate
  }
  const body = parsed.content?.body
  if (!body) return undefined
  const price = Number(parsed.rate?.price?.priceMicros)
  const spend = spendToday()
  spend.reads++
  if (Number.isFinite(price)) spend.micros += price
  log('news-feed: tollbit read', {
    url,
    priceUsd: Number.isFinite(price) ? price / 1_000_000 : undefined,
    todayReads: spend.reads,
    todayUsd: spend.micros / 1_000_000,
  })
  const published = Date.parse(parsed.metadata?.published ?? '')
  return {
    text: markdownToText(body),
    title: parsed.metadata?.title,
    author: parsed.metadata?.author,
    published: Number.isFinite(published) ? published : undefined,
    priceMicros: Number.isFinite(price) ? price : undefined,
  }
}

/** Licensable articles on a headline, from TollBit's search of its network.
 * The search says what can be licensed; the rate is asked for before a read. */
export async function searchTollbit(
  headline: string,
  aroundTime: number
): Promise<IndexedArticle[]> {
  const key = tollbitKey()
  if (!key) return []
  const terms = searchTerms(headline, 6)
  if (terms.length < 2) return []
  const params = new URLSearchParams({
    q: terms.join(' '),
    size: '10',
    readyToLicense: 'true',
  })
  const res = await httpsRequest(`${tollbitBase()}/dev/v2/search?${params}`, {
    headers: { TollbitKey: key },
    allow: onlyTollbit,
  })
  if (!isOk(res))
    throw new Error(`tollbit search: ${res.status} ${res.body.slice(0, 160)}`)
  const parsed = JSON.parse(res.body) as {
    items?: {
      title?: string
      url?: string
      publishedDate?: string
      publisher?: { domain?: string; name?: string }
      availability?: { readyToLicense?: boolean }
    }[]
  }
  return (parsed.items ?? []).flatMap((it): IndexedArticle[] => {
    if (!it.url || !it.title || it.availability?.readyToLicense === false)
      return []
    if (!/^https:\/\//.test(it.url)) return []
    const host = hostnameOf(it.url)
    const published = Date.parse(it.publishedDate ?? '')
    return [
      {
        url: it.url,
        title: it.title,
        publisher:
          it.publisher?.name ?? outletName(host) ?? host ?? 'Publisher',
        site: `https://${it.publisher?.domain ?? host ?? ''}`,
        publishedTime: Number.isFinite(published) ? published : aroundTime,
        provider: 'tollbit',
      },
    ]
  })
}

// ---------------------------------------------------------------------------
// GNews (prototype only): https://docs.gnews.io. Paid plans return the body
// in `content`, but GNews owns none of it and leaves the rights with the
// buyer, so this is discovery, not a licence.

type GNewsArticle = {
  title?: string
  description?: string
  content?: string
  url?: string
  image?: string
  publishedAt?: string
  source?: { name?: string; url?: string }
}

const TRUNCATION_MARK = /\s*\.{0,3}\s*\[\d+ chars\]\s*$/

/** Articles GNews finds for a story's headline around its time. Untested
 * without a key; shaped from the documented response. */
export async function searchGNews(
  headline: string,
  aroundTime: number
): Promise<IndexedArticle[]> {
  const key = process.env.GNEWS_API_KEY
  if (!key) return []
  const q = headline
    .replace(/["“”]/g, '')
    .split(/\s+/)
    .slice(0, 12)
    .join(' ')
    .slice(0, 190)
  const params = new URLSearchParams({
    q,
    lang: 'en',
    max: '5',
    sortby: 'relevance',
    from: new Date(aroundTime - 2 * DAY_MS).toISOString(),
    apikey: key,
  })
  const raw = await fetchText(
    `https://gnews.io/api/v4/search?${params}`,
    (u) => u.protocol === 'https:' && u.hostname === 'gnews.io'
  )
  const parsed = JSON.parse(raw) as { articles?: GNewsArticle[] }
  return (parsed.articles ?? []).flatMap((a): IndexedArticle[] => {
    const published = Date.parse(a.publishedAt ?? '')
    if (!a.url || !a.title || !Number.isFinite(published)) return []
    const content = a.content?.replace(TRUNCATION_MARK, '')
    return [
      {
        url: a.url,
        title: a.title,
        description: a.description,
        publisher: a.source?.name ?? hostnameOf(a.url) ?? 'GNews',
        site: a.source?.url ?? new URL(a.url).origin,
        publishedTime: published,
        image: a.image,
        provider: 'gnews',
        text: content,
      },
    ]
  })
}
