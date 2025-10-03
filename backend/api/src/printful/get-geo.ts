import { APIError, APIHandler } from 'api/helpers/endpoint'
import { DAY_MS } from 'common/util/time'

let CACHE: { data: any; ts: number } | null = null
const TTL_MS = DAY_MS

export const getPrintfulGeo: APIHandler<'get-printful-geo'> = async () => {
  const apiKey = process.env.PRINTFUL_KEY
  if (!apiKey) throw new APIError(500, 'PRINTFUL_KEY is not configured')

  if (CACHE && Date.now() - CACHE.ts < TTL_MS) {
    return CACHE.data
  }

  const resp = await fetch('https://api.printful.com/countries', {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new APIError(resp.status as any, text || 'Failed to fetch countries')
  }
  const json = await resp.json()
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
  return payload
}
