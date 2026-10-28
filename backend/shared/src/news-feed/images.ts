import { uniq } from 'lodash'
import { NewsImageCredit, NewsImageSource } from 'common/news-feed'
import { fetchText } from './sources'

/**
 * Pictures for stories.
 *
 * The licensed route is Wikimedia Commons: the lead picture of the Wikipedia
 * article on what the story is about (the person, team, body or event), which
 * Wikipedia only serves here when the file is under a free licence, together
 * with the author and licence the card must credit. Outlets' own thumbnails
 * are publisher images we do not license, so they stay a prototype option.
 */

/** NEWS_IMAGES: 'wikimedia' (default), 'outlets' (prototype only), 'none'. */
export function imageSource(): NewsImageSource {
  const raw = (process.env.NEWS_IMAGES ?? 'wikimedia').trim()
  return raw === 'outlets' || raw === 'none' ? raw : 'wikimedia'
}

const WIKI_API = 'https://en.wikipedia.org/w/api.php'
const COMMONS_FILE = 'https://commons.wikimedia.org/wiki/File:'
const THUMB_WIDTH = 640
/** Subjects looked up per story, in the order given. */
const MAX_SUBJECTS = 8
/** A photograph older than this is an archive picture, not an illustration
 * of today's news (the lead picture of "Airstrike" is from 1944). Files with
 * no date pass. */
const OLDEST_PHOTO_YEAR = 2008
/** Logos, seals, flags, maps and diagrams are free but say nothing about
 * the day's news; a photograph does. */
const NOT_A_PHOTO =
  /\.(svg|gif|webp|png)$|flag_of|seal_of|logo|coat_of_arms|emblem|map_of|locator|diagram|chart|icon/i

const onlyWikipedia = (u: URL) =>
  u.protocol === 'https:' && u.hostname === 'en.wikipedia.org'

type Redirect = { from: string; to: string }
type PageImagesResponse = {
  query?: {
    normalized?: Redirect[]
    redirects?: Redirect[]
    pages?: {
      title: string
      missing?: boolean
      pageimage?: string
      thumbnail?: { source: string; width: number; height: number }
    }[]
  }
}
type ImageInfoResponse = {
  query?: {
    pages?: {
      title: string
      imageinfo?: {
        descriptionurl?: string
        extmetadata?: Record<string, { value?: string } | undefined>
      }[]
    }[]
  }
}

const stripHtml = (s: string) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

/** The API tags image URLs with campaign parameters; the picture is the same
 * without them. */
const stripTracking = (url: string) => url.replace(/\?utm_[^#]*$/, '')

export type FoundImage = { image: string; credit: NewsImageCredit }

/**
 * The lead photograph of the first subject that has one, in the order given
 * (the verifier's subject first, then what the source linked). Nothing for
 * most abstract stories, which is fine: the card renders without a picture.
 */
export async function findWikimediaImage(
  subjects: string[]
): Promise<FoundImage | undefined> {
  const titles = uniq(subjects.map((s) => s.trim()).filter(Boolean)).slice(
    0,
    MAX_SUBJECTS
  )
  if (titles.length === 0) return undefined
  const params = new URLSearchParams({
    action: 'query',
    prop: 'pageimages',
    piprop: 'thumbnail|name',
    pithumbsize: String(THUMB_WIDTH),
    // Only files under a free licence; fair-use images never come back.
    pilicense: 'free',
    redirects: '1',
    titles: titles.join('|'),
    format: 'json',
    formatversion: '2',
  })
  const res = JSON.parse(
    await fetchText(`${WIKI_API}?${params}`, onlyWikipedia)
  ) as PageImagesResponse
  // Titles come back normalised and redirected; follow both maps so the
  // caller's order still decides which subject's picture is used.
  const forward = new Map<string, string>()
  for (const n of res.query?.normalized ?? []) forward.set(n.from, n.to)
  for (const r of res.query?.redirects ?? []) forward.set(r.from, r.to)
  const resolve = (title: string) => {
    let current = title
    for (let i = 0; i < 4 && forward.has(current); i++)
      current = forward.get(current) as string
    return current
  }
  const pages = new Map(
    (res.query?.pages ?? []).map((p) => [p.title, p] as const)
  )
  for (const title of titles) {
    const page = pages.get(resolve(title))
    if (!page?.pageimage || !page.thumbnail?.source) continue
    if (NOT_A_PHOTO.test(page.pageimage)) continue
    const credit = await creditFor(page.pageimage)
    if (!credit) continue
    return { image: stripTracking(page.thumbnail.source), credit }
  }
  return undefined
}

/** The author and licence of a Commons file, from its description page. A
 * file whose licence the page does not state is not used: the card could
 * not credit it. */
async function creditFor(file: string): Promise<NewsImageCredit | undefined> {
  const params = new URLSearchParams({
    action: 'query',
    prop: 'imageinfo',
    iiprop: 'extmetadata|url',
    iiextmetadatafilter:
      'LicenseShortName|LicenseUrl|Artist|Credit|DateTimeOriginal',
    titles: 'File:' + file,
    format: 'json',
    formatversion: '2',
  })
  const res = JSON.parse(
    await fetchText(`${WIKI_API}?${params}`, onlyWikipedia)
  ) as ImageInfoResponse
  const info = res.query?.pages?.[0]?.imageinfo?.[0]
  const meta = info?.extmetadata ?? {}
  const license = stripHtml(meta.LicenseShortName?.value ?? '')
  if (!license || /fair use|non-free/i.test(license)) return undefined
  const taken = stripHtml(meta.DateTimeOriginal?.value ?? '').match(
    /\b(1[89]\d{2}|20\d{2})\b/
  )
  if (taken && Number(taken[1]) < OLDEST_PHOTO_YEAR) return undefined
  const author =
    stripHtml(meta.Artist?.value ?? meta.Credit?.value ?? '') || undefined
  const licenseUrl = meta.LicenseUrl?.value
  return {
    author: author?.slice(0, 80),
    license: license.slice(0, 40),
    licenseUrl:
      licenseUrl && /^https?:\/\//.test(licenseUrl) ? licenseUrl : undefined,
    url: info?.descriptionurl ?? COMMONS_FILE + encodeURIComponent(file),
  }
}
