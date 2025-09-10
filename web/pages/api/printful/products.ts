import type { NextApiRequest, NextApiResponse } from 'next'

type PrintfulProduct = {
  id: number
  name: string
  thumbnail_url: string
}

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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ message: 'Method Not Allowed' })
  }

  const apiKey = process.env.PRINTFUL_KEY
  if (!apiKey) {
    return res.status(500).json({ message: 'PRINTFUL_KEY is not configured' })
  }

  try {
    const listResp = await fetch('https://api.printful.com/store/products', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!listResp.ok) {
      const text = await listResp.text()
      return res
        .status(listResp.status)
        .json({ message: 'Failed to fetch products', details: text })
    }
    const listJson = await listResp.json()
    const products: PrintfulProduct[] = listJson.result ?? []

    // Fetch details to get variants/prices
    const detailed = await Promise.all(
      products.map(async (p) => {
        const d = await fetch(
          `https://api.printful.com/store/products/${p.id}`,
          { headers: { Authorization: `Bearer ${apiKey}` } }
        )
        if (!d.ok) return { product: p, variants: [] as PrintfulVariant[] }
        const dj = await d.json()
        const variants: PrintfulVariant[] = dj.result?.sync_variants ?? []

        // Enrich each variant with size/color/preview, with robust fallbacks
        const enriched = await Promise.all(
          variants.map(async (v) => {
            try {
              const sv = await fetch(
                `https://api.printful.com/store/variants/${v.id}`,
                { headers: { Authorization: `Bearer ${apiKey}` } }
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
                  .map((f) => f.preview_url || f.thumbnail_url || f.url)
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
          })
        )

        // Backfill: if a variant has no preview/images, borrow from siblings with same color
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
      })
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

    return res.status(200).json({ products: simplified })
  } catch (e: any) {
    return res.status(500).json({ message: e?.message ?? 'Unknown error' })
  }
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

// intentionally omit color heuristics to avoid wrong values like "structured"/"unisex"
function parseColor(name: string | undefined, sku?: string) {
  // Primary: parse from name, e.g. "Product / Black/White / One size"
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
  // Fallback: parse from SKU, e.g. "..._Black/White-OSFA" or "..._Black-XS"
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
  // Prefer preview-type mockups (jpeg/jpg) over transparent PNG assets
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
