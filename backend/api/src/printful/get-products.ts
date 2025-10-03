import { APIError, APIHandler } from 'api/helpers/endpoint'

type PrintfulProduct = { id: number; name: string; thumbnail_url: string }
type PrintfulVariant = {
  id: number
  name: string
  retail_price?: string
  currency?: string
  files?: { type: string; preview_url?: string; url?: string }[]
  size?: string
  color?: string
  preview?: string
  images?: string[]
  sku?: string
}

let CACHE: { data: any; ts: number } | null = null
const CACHE_TTL_MS = 6 * 60 * 60 * 1000 // 6 hours freshness window
const REFRESH_MIN_GAP_MS = 30 * 60 * 1000 // don't refresh more than once every 30 min
const DETAIL_CONCURRENCY = 3
let REFRESH_IN_FLIGHT: Promise<void> | null = null
let lastRefreshAttempt = 0
let cooldownUntil = 0

async function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms))
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  attempts = 3,
  backoffMs = 500
) {
  let lastErr: any
  for (let i = 0; i < attempts; i++) {
    const resp = await fetch(url, init)
    if (resp.ok) return resp
    if (resp.status === 429) {
      const retryAfter = Number(resp.headers.get('retry-after'))
      await sleep((retryAfter ? retryAfter * 1000 : backoffMs) * (i + 1))
      lastErr = new Error(`429 Too Many Requests: ${url}`)
      continue
    }
    if (resp.status >= 500) {
      lastErr = new Error(`${resp.status} ${resp.statusText}`)
      await sleep(backoffMs * (i + 1))
      continue
    }
    return resp
  }
  throw lastErr ?? new Error('Failed after retries')
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, idx: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let i = 0
  let active = 0
  return new Promise((resolve, reject) => {
    const next = () => {
      if (i >= items.length && active === 0) return resolve(results)
      while (active < limit && i < items.length) {
        const idx = i++
        active++
        fn(items[idx], idx)
          .then((r) => (results[idx] = r))
          .catch(reject)
          .finally(() => {
            active--
            next()
          })
      }
    }
    next()
  })
}

export const getPrintfulProducts: APIHandler<
  'get-printful-products'
> = async () => {
  const apiKey = process.env.PRINTFUL_KEY
  if (!apiKey) throw new APIError(500, 'PRINTFUL_KEY is not configured')

  // Helper that refreshes the cache with gating and cooldown
  const refreshCache = async () => {
    // honor cooldowns (e.g., after hitting 429)
    if (Date.now() < cooldownUntil) return
    lastRefreshAttempt = Date.now()
    try {
      const listResp = await fetchWithRetry(
        'https://api.printful.com/store/products',
        {
          headers: { Authorization: `Bearer ${apiKey}` },
        }
      )
      if (listResp.status === 429) {
        cooldownUntil = Date.now() + 60 * 60 * 1000 // 1h cooldown on rate limit
      }
      if (!listResp.ok) {
        const text = await listResp.text()
        throw new APIError(
          listResp.status as any,
          text || 'Failed to fetch products'
        )
      }
      const listJson = await listResp.json()
      const products: PrintfulProduct[] = listJson.result ?? []

      const detailed = await mapLimit(
        products,
        DETAIL_CONCURRENCY,
        async (p) => {
          const d = await fetchWithRetry(
            `https://api.printful.com/store/products/${p.id}`,
            {
              headers: { Authorization: `Bearer ${apiKey}` },
            }
          )
          if (!d.ok) return { product: p, variants: [] as PrintfulVariant[] }
          const dj = await d.json()
          const variants: PrintfulVariant[] = dj.result?.sync_variants ?? []

          const enriched = await mapLimit(
            variants,
            DETAIL_CONCURRENCY,
            async (v) => {
              try {
                const sv = await fetchWithRetry(
                  `https://api.printful.com/store/variants/${v.id}`,
                  {
                    headers: { Authorization: `Bearer ${apiKey}` },
                  }
                )
                if (!sv.ok) {
                  return addHeuristics(v)
                }
                const svj = await sv.json()
                const size: string | undefined =
                  svj.result?.variant?.size ?? svj.result?.product?.size
                const color: string | undefined =
                  svj.result?.variant?.color ??
                  svj.result?.product?.color ??
                  svj.result?.variant?.color_name
                const fileArr: {
                  type?: string
                  preview_url?: string
                  thumbnail_url?: string
                  url?: string
                }[] = [
                  ...(svj.result?.variant?.files ?? []),
                  ...(svj.result?.product?.files ?? []),
                  ...(svj.result?.files ?? []),
                  ...(v.files ?? []),
                ].filter((f) => (f as any).type === 'preview')
                const allPreviews = dedupeUrls(
                  fileArr
                    .map(
                      (f) => f.preview_url || (f as any).thumbnail_url || f.url
                    )
                    .filter((u): u is string => Boolean(u))
                )
                const preview = selectBestPreview(allPreviews)
                return {
                  ...v,
                  size: size ?? parseSize(v.name),
                  color: color ?? parseColor(v.name, (v as any).sku),
                  preview,
                  images: allPreviews,
                  sku: (v as any).sku,
                }
              } catch {
                return addHeuristics(v)
              }
            }
          )

          const imagesByColor: Record<string, string[]> = {}
          for (const ev of enriched) {
            if (ev.color && ev.images && ev.images.length > 0) {
              imagesByColor[ev.color] = dedupeUrls(
                (imagesByColor[ev.color] ?? []).concat(ev.images)
              )
            }
          }
          const backfilled = enriched.map((ev) => {
            let imgs = ev.images ?? []
            if ((imgs.length === 0 || !imgs[0]) && ev.color) {
              const pool = imagesByColor[ev.color]
              if (pool && pool.length > 0) imgs = pool
            }
            const prev = ev.preview ?? selectBestPreview(imgs)
            return { ...ev, images: imgs, preview: prev }
          })

          return { product: p, variants: backfilled }
        }
      )

      const simplified = detailed.map(({ product, variants }) => {
        const allVariantImages = dedupeUrls(
          variants.flatMap((v) => (v as any).images ?? [])
        )
        const preview =
          selectBestPreview(allVariantImages) || product.thumbnail_url
        return {
          id: product.id,
          title: product.name,
          imageUrl: preview,
          variants: variants.map((v) => ({
            id: v.id,
            name: v.name,
            retail_price: v.retail_price,
            currency: v.currency,
            size: v.size,
            color: v.color,
            preview: v.preview,
            images: (v as any).images ?? [],
          })),
        }
      })

      const payload = { products: simplified }
      CACHE = { data: payload, ts: Date.now() }
    } catch (e: any) {
      // If rate-limited, set a cooldown; otherwise just keep old cache
      if (e?.message?.includes('429') || e?.message?.includes('Too Many')) {
        cooldownUntil = Date.now() + 60 * 60 * 1000
      }
    }
  }

  // If we have a cache, always serve it immediately and maybe refresh in background
  if (CACHE) {
    const isStale = Date.now() - CACHE.ts > CACHE_TTL_MS
    const canAttempt =
      Date.now() - lastRefreshAttempt > REFRESH_MIN_GAP_MS &&
      Date.now() > cooldownUntil
    if (isStale && canAttempt && !REFRESH_IN_FLIGHT) {
      REFRESH_IN_FLIGHT = (async () => {
        try {
          await refreshCache()
        } finally {
          REFRESH_IN_FLIGHT = null
        }
      })()
    }
    return CACHE.data
  }

  // Cold start: fetch once and populate cache
  await refreshCache()
  if (CACHE) return (CACHE as { data: any }).data
  // As a last resort, return empty payload
  return { products: [] }
}

function addHeuristics(v: PrintfulVariant) {
  const images = dedupeUrls(
    (v.files ?? [])
      .filter((f) => (f as any).type === 'preview')
      .map((f) => f.preview_url || (f as any).thumbnail_url || f.url)
      .filter((u): u is string => Boolean(u))
  )
  return {
    ...v,
    size: (v as any).size ?? parseSize(v.name),
    color: (v as any).color ?? parseColor(v.name, (v as any).sku),
    preview: selectBestPreview(images),
    images,
    sku: (v as any).sku,
  }
}

function parseSize(name: string | undefined) {
  if (!name) return undefined
  const sizes = [
    'XS',
    'S',
    'M',
    'L',
    'XL',
    '2XL',
    '3XL',
    '4XL',
    '5XL',
    'One',
    'One Size',
    'OSFA',
    'OSFM',
    'S/M',
    'M/L',
    'L/XL',
  ]
  const tokens = name.split(/[\s/,-]+/)
  const found = tokens.find((t) => sizes.includes(t.toUpperCase()))
  return found
}

function parseColor(name: string | undefined, sku?: string) {
  if (name) {
    const nameParts = name
      .split(' / ')
      .map((s) => s.trim())
      .filter(Boolean)
    if (nameParts.length >= 2) {
      const last = nameParts[nameParts.length - 1]
      const preLast = nameParts[nameParts.length - 2]
      const candidate = isSize(last) ? preLast : last
      if (candidate && !isSize(candidate)) return candidate
    }
  }
  if (sku && sku.includes('_')) {
    const after = sku.split('_').pop() as string
    const dashIdx = after.lastIndexOf('-')
    const colorPart = dashIdx > 0 ? after.slice(0, dashIdx) : after
    if (colorPart && !isSize(colorPart)) return colorPart.replace(/_/g, ' ')
  }
  return undefined
}

function isSize(token: string): boolean {
  const normalized = token.toUpperCase()
  const sizeSet = new Set([
    'XS',
    'S',
    'M',
    'L',
    'XL',
    '2XL',
    '3XL',
    '4XL',
    'ONE',
    'ONE SIZE',
    'OSFA',
    'OSFM',
    'S/M',
    'M/L',
    'L/XL',
  ])
  return sizeSet.has(normalized)
}

function dedupeUrls(urls: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const u of urls) {
    if (!seen.has(u)) {
      seen.add(u)
      out.push(u)
    }
  }
  return out
}

function selectBestPreview(urls: string[]): string | undefined {
  if (urls.length === 0) return undefined
  const byScore = [...urls].sort((a, b) => scoreUrl(b) - scoreUrl(a))
  return byScore[0]
}

function scoreUrl(u: string): number {
  let s = 0
  const lower = u.toLowerCase()
  if (lower.includes('preview')) s += 5
  if (lower.includes('products')) s += 3
  if (lower.includes('mockup')) s += 2
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) s += 3
  if (lower.endsWith('.png')) s += 1
  return s
}
