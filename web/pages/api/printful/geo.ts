import type { NextApiRequest, NextApiResponse } from 'next'
import { DAY_MS } from 'common/util/time'

// In-memory cache per server instance
let CACHE: { data: any; ts: number } | null = null
const TTL_MS = DAY_MS // 24 hours

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader(
    'Cache-Control',
    'public, s-maxage=86400, stale-while-revalidate=86400'
  )
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ message: 'Method Not Allowed' })
  }

  const apiKey = process.env.PRINTFUL_KEY
  if (!apiKey) {
    return res.status(500).json({ message: 'PRINTFUL_KEY is not configured' })
  }

  try {
    if (CACHE && Date.now() - CACHE.ts < TTL_MS) {
      res.setHeader('X-Cache', 'HIT')
      return res.status(200).json(CACHE.data)
    }

    const resp = await fetch('https://api.printful.com/countries', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!resp.ok) {
      const text = await resp.text()
      return res
        .status(resp.status)
        .json({ message: 'Failed to fetch countries', details: text })
    }
    const json = await resp.json()
    // Expected structure: { result: [{ code, name, states?: [{ code, name }] }, ...] }
    const countries = (json?.result ?? []).map((c: any) => ({
      code: String(c.code || c.id || '').toUpperCase(),
      name: String(c.name || ''),
      states: Array.isArray(c.states)
        ? c.states.map((s: any) => ({
            code: String(s.code || s.id || '').toUpperCase(),
            name: String(s.name || ''),
          }))
        : [],
    }))

    const payload = { countries }
    CACHE = { data: payload, ts: Date.now() }
    res.setHeader('X-Cache', 'MISS')
    return res.status(200).json(payload)
  } catch (e: any) {
    if (CACHE) {
      res.setHeader('X-Cache', 'STALE')
      return res.status(200).json(CACHE.data)
    }
    return res.status(500).json({ message: e?.message ?? 'Unknown error' })
  }
}
