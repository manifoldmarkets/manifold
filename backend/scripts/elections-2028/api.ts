// Minimal Manifold API client for create-national-markets.ts.
//
// Reads are paced and retried (429 honors Retry-After; 5xx and network errors
// back off). Writes refuse to run unless the client was built with
// `allowWrites: true` and an API key; the key is only ever placed in the
// Authorization header and never logged.

import type { SourceAnswer } from './seeds'
import type { CreatePayload, SourceMarket } from './national-markets'

export const API_BASES = {
  prod: 'https://api.manifold.markets',
  dev: 'https://api.dev.manifold.markets',
} as const

export const WEB_BASES = {
  prod: 'https://manifold.markets',
  dev: 'https://dev.manifold.markets',
} as const

const USER_AGENT = 'ManifoldNationalMarkets/1.0 (https://manifold.markets)'

export type ApiErrorKind = 'rate-limited' | 'ambiguous' | 'rejected'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly kind: ApiErrorKind,
    readonly status?: number,
    readonly retryAfterMs?: number
  ) {
    super(message)
  }
}

export type MarketRow = SourceMarket & {
  creatorId?: string
  creatorUsername?: string
  slug?: string
  url?: string
  closeTime?: number
  createdTime?: number
  mechanism?: string
  addAnswersMode?: string
  shouldAnswersSumToOne?: boolean
}

export type Group = { id: string; slug: string; name: string }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function toMarketRow(m: any): MarketRow {
  return {
    id: String(m.id),
    question: String(m.question ?? ''),
    outcomeType: String(m.outcomeType ?? ''),
    isResolved: !!m.isResolved,
    uniqueBettorCount:
      m.uniqueBettorCount === undefined ? undefined : Number(m.uniqueBettorCount),
    probability:
      m.probability === undefined ? undefined : Number(m.probability),
    answers: Array.isArray(m.answers)
      ? m.answers.map(
          (a: any): SourceAnswer => ({
            text: String(a.text ?? ''),
            probability: Number(a.probability),
            isOther: !!a.isOther,
          })
        )
      : undefined,
    creatorId: m.creatorId,
    creatorUsername: m.creatorUsername,
    slug: m.slug,
    url: m.url,
    closeTime: m.closeTime === undefined ? undefined : Number(m.closeTime),
    createdTime: m.createdTime === undefined ? undefined : Number(m.createdTime),
    mechanism: m.mechanism,
    addAnswersMode: m.addAnswersMode,
    shouldAnswersSumToOne: m.shouldAnswersSumToOne,
  }
}

export function makeApi(opts: {
  apiBase: string
  apiKey?: string
  allowWrites: boolean
  paceMs?: number
  readTimeoutMs?: number
  writeTimeoutMs?: number
}) {
  const url = (path: string) => `${opts.apiBase.replace(/\/$/, '')}/${path}`
  let last = 0
  const pace = async () => {
    const wait = (opts.paceMs ?? 0) - (Date.now() - last)
    if (wait > 0) await sleep(wait)
    last = Date.now()
  }

  const classify = async (res: Response, what: string) => {
    const body = await res.text().catch(() => '')
    const message = `${what}: HTTP ${res.status} ${body.slice(0, 300)}`
    if (res.status === 429) {
      const ra = Number(res.headers.get('retry-after'))
      return new ApiError(
        message,
        'rate-limited',
        429,
        Number.isFinite(ra) && ra > 0 ? ra * 1000 : undefined
      )
    }
    if (res.status >= 500) return new ApiError(message, 'ambiguous', res.status)
    return new ApiError(message, 'rejected', res.status)
  }

  // GET with retries. 404 returns undefined.
  const get = async (path: string, auth = false): Promise<any> => {
    const headers: Record<string, string> = { 'User-Agent': USER_AGENT }
    if (auth) {
      if (!opts.apiKey) throw new Error('MANIFOLD_API_KEY is required for this read')
      headers.Authorization = `Key ${opts.apiKey}`
    }
    for (let attempt = 0; ; attempt++) {
      let res: Response
      try {
        await pace()
        res = await fetch(url(path), {
          headers,
          signal: AbortSignal.timeout(opts.readTimeoutMs ?? 20_000),
        })
      } catch (err) {
        if (attempt >= 4)
          throw new ApiError(`GET ${path}: ${(err as Error).message}`, 'ambiguous')
        await sleep(1000 * 2 ** attempt)
        continue
      }
      if (res.ok) return res.json()
      if (res.status === 404) return undefined
      const err = await classify(res, `GET ${path}`)
      if (err.kind !== 'rejected' && attempt < 4) {
        await sleep(err.retryAfterMs ?? 1000 * 2 ** attempt)
        continue
      }
      throw err
    }
  }

  // POST without automatic retries: a failed create may still have happened
  // on the server, so the caller reconciles by reading the reserved id.
  const post = async (path: string, body: unknown): Promise<any> => {
    if (!opts.allowWrites)
      throw new Error('Refusing to write: this client was built for a dry run')
    if (!opts.apiKey) throw new Error('MANIFOLD_API_KEY is required to write')
    await pace()
    let res: Response
    try {
      res = await fetch(url(path), {
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
          Authorization: `Key ${opts.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(opts.writeTimeoutMs ?? 60_000),
      })
    } catch (err) {
      throw new ApiError(`POST ${path}: ${(err as Error).message}`, 'ambiguous')
    }
    if (!res.ok) throw await classify(res, `POST ${path}`)
    return res.json().catch(() => undefined)
  }

  return {
    // `fresh` adds a cache-busting query parameter: market reads are CDN
    // cached (max-age=5, stale-while-revalidate=10), so a 404 seen just before
    // a create could otherwise be served again for the read-back. The
    // endpoint's props schema is not strict, so the extra parameter is
    // ignored by the server.
    getMarket: async (
      id: string,
      opts: { fresh?: boolean } = {}
    ): Promise<MarketRow | undefined> => {
      const bust = opts.fresh ? `?cacheBust=${Date.now()}` : ''
      const m = await get(`v0/market/${encodeURIComponent(id)}${bust}`)
      return m ? toMarketRow(m) : undefined
    },
    getGroup: async (slug: string): Promise<Group | undefined> => {
      const g = await get(`v0/group/${encodeURIComponent(slug)}`)
      return g ? { id: String(g.id), slug: String(g.slug), name: String(g.name) } : undefined
    },
    // Every market a user created, newest first (paginated by id cursor).
    marketsByUser: async (userId: string): Promise<MarketRow[]> => {
      const out: MarketRow[] = []
      let before: string | undefined
      for (let page = 0; page < 50; page++) {
        const q = new URLSearchParams({ userId, limit: '1000' })
        if (before) q.set('before', before)
        const rows = await get(`v0/markets?${q}`)
        if (!Array.isArray(rows)) throw new Error('markets: no result list')
        out.push(...rows.map(toMarketRow))
        if (rows.length < 1000) return out
        before = String(rows[rows.length - 1].id)
      }
      throw new Error('markets: too many pages')
    },
    me: async (): Promise<{ id: string; username: string; balance: number }> => {
      const u = await get('v0/me', true)
      if (!u) throw new Error('v0/me returned nothing')
      return { id: String(u.id), username: String(u.username), balance: Number(u.balance) }
    },
    createMarket: async (payload: CreatePayload): Promise<MarketRow> =>
      toMarketRow(await post('v0/market', payload)),
    publishMarket: async (id: string): Promise<void> => {
      const body = await post(`v0/market/${encodeURIComponent(id)}/update`, {
        visibility: 'public',
      })
      if (body?.success !== true)
        throw new ApiError('publish: response did not confirm success', 'ambiguous')
    },
  }
}

export type Api = ReturnType<typeof makeApi>

// Whether a public image URL serves an image (used to attach candidate
// photos only when they are live on the target site).
export async function imageExists(url: string): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(15_000),
      })
      const type = res.headers.get('content-type') ?? ''
      // Drain the body so the connection is released.
      await res.arrayBuffer().catch(() => undefined)
      if (res.status === 404) return false
      if (res.ok) return type.startsWith('image/')
    } catch {
      // retry
    }
    await sleep(500 * 2 ** attempt)
  }
  return false
}
