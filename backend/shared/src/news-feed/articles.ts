import { uniqBy } from 'lodash'
import { NewsArticle } from 'common/news-feed'
import { mapAsync } from 'common/util/promise'
import { DAY_MS } from 'common/util/time'
import { log } from 'shared/utils'
import { fetchText, hostnameOf, isPublicHttps } from './sources'

/**
 * Full article text, which claims are read from.
 *
 * Production needs a licensed provider with full text (GNews is being
 * evaluated: its search returns the body in `content` on paid plans). When
 * GNEWS_API_KEY is set that search is tried first. Without it the prototype
 * indexes a few outlets' public RSS feeds, matches their articles to stories
 * by embedding, and reads the article page itself. Only these outlets' hosts
 * are ever fetched. Pricing, coverage, completeness and permissions remain
 * open checks; the feed only shows short attributed excerpts with a link.
 */

export type IndexedArticle = NewsArticle & {
  description?: string
  provider: 'rss' | 'gnews'
  /** The body, when the provider returns it (GNews). */
  text?: string
  /** Found among the story's own links rather than in the index, so the
   * title is the story's, not the outlet's, until the page is read. */
  ownLink?: boolean
}

type Outlet = {
  publisher: string
  site: string
  hosts: string[]
  feeds: string[]
}

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

/** The outlet behind a URL, when it is one whose pages we read. */
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

/** Recent articles from the outlets we can read, newest first. */
export async function fetchArticleIndex(now = Date.now()) {
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
    words: text.split(/\s+/).filter(Boolean).length,
    image: image && /^https:\/\//.test(image) ? decode(image) : undefined,
    title: title ? stripTags(title) : undefined,
  }
}

/** Read an article page from one of the outlets we index. */
export async function readArticle(
  article: IndexedArticle
): Promise<{ text: string; image?: string; title?: string } | undefined> {
  if (article.text) {
    const words = article.text.split(/\s+/).filter(Boolean).length
    return words >= MIN_BODY_WORDS
      ? { text: article.text.slice(0, MAX_BODY_CHARS) }
      : undefined
  }
  if (!readableOutlet(article.url)) return undefined
  const html = await fetchText(
    article.url,
    (u) => isPublicHttps(u) && !!readableOutlet(u.toString())
  )
  const body = extractArticleBody(html)
  if (body.words < MIN_BODY_WORDS) return undefined
  return { text: body.text, image: body.image, title: body.title }
}

// ---------------------------------------------------------------------------
// GNews (optional): https://docs.gnews.io. Paid plans return the full body
// in `content`; the free plan truncates it and appends "[N chars]".

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

export const isGNewsEnabled = () => !!process.env.GNEWS_API_KEY

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
