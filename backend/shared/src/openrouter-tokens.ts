import { RankingRow } from 'common/perps/open-weight-models'
import { log } from './utils'

// OpenRouter token-share oracle — the adapter for the open-weight-vs-closed
// AI perp. OpenRouter publishes per-model daily token totals for its top 50
// models (plus one aggregated `other` row) through an authenticated datasets
// endpoint.
//
// USE THE API, NEVER SCRAPE openrouter.ai/rankings — their ToS prohibits
// scraping the site; this endpoint is the sanctioned path.
//
// The index math (which models count, how the window is taken) lives in
// `common/perps/open-weight-models.ts` so the market page can render the same
// methodology the oracle scores against. This file only fetches and parses.

export const OPENROUTER_RANKINGS_URL =
  'https://openrouter.ai/api/v1/datasets/rankings-daily'

const FETCH_TIMEOUT_MS = 30_000

export type OpenRouterRankings = {
  rows: RankingRow[]
  /** `meta.as_of` — required verbatim in the attribution string (§6). */
  asOf: string | null
}

/**
 * Fetch daily per-model token totals for a UTC date range (inclusive).
 *
 * Note on freshness: OpenRouter clamps `end_date` to the last COMPLETE UTC
 * day — asking for today returns yesterday, and asking for only today is a
 * 400. There is no sub-day granularity (`period` accepts day/week/month
 * only). The caller asks for a wider range than it needs and keeps the newest
 * N dates, so the window is right either way.
 *
 * Returns null when the key is absent, so the caller can skip rather than
 * crash — matching sports-live.ts's graceful pattern, not the throwing one.
 */
export const fetchOpenRouterRankings = async (
  startDate: string,
  endDate: string
): Promise<OpenRouterRankings | null> => {
  const apiKey = process.env.OPENROUTER_API_KEY ?? ''
  if (!apiKey) {
    log.error(
      '[openrouter] OPENROUTER_API_KEY not set — launch feed cannot publish'
    )
    return null
  }

  const url = `${OPENROUTER_RANKINGS_URL}?start_date=${startDate}&end_date=${endDate}&period=day`
  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${apiKey}`,
      'user-agent': 'Manifold/1.0 (+https://manifold.markets)',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok)
    throw new Error(
      `OpenRouter rankings ${startDate}..${endDate}: ${res.status} ${res.statusText}`
    )

  const body = (await res.json()) as unknown
  if (!body || typeof body !== 'object')
    throw new Error('OpenRouter rankings response is not an object')

  const data = 'data' in body ? body.data : undefined
  const rawMeta = 'meta' in body ? body.meta : undefined
  const rawAsOf =
    rawMeta && typeof rawMeta === 'object' && 'as_of' in rawMeta
      ? rawMeta.as_of
      : undefined
  const asOf =
    typeof rawAsOf === 'string' &&
    rawAsOf.trim().length > 0 &&
    Number.isFinite(Date.parse(rawAsOf))
      ? rawAsOf
      : null
  const rows = parseRankingRows(data)
  log(
    `[openrouter] fetched ${rows.length} rows for ${startDate}..${endDate}` +
      ` (as_of ${asOf ?? 'unknown'})`
  )
  return { rows, asOf }
}

/** Reject the whole payload on shape drift. Silently dropping only malformed
 * rows would bias the executable index toward whichever side still parsed. */
export const parseRankingRows = (data: unknown): RankingRow[] => {
  if (!Array.isArray(data))
    throw new Error('OpenRouter rankings payload data is not an array')

  return data.map((row, index) => {
    if (
      !row ||
      typeof row !== 'object' ||
      !('date' in row) ||
      typeof row.date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
      !('model_permaslug' in row) ||
      typeof row.model_permaslug !== 'string' ||
      row.model_permaslug.length === 0 ||
      !('total_tokens' in row) ||
      typeof row.total_tokens !== 'string' ||
      !/^\d+(?:\.\d+)?$/.test(row.total_tokens.trim())
    )
      throw new Error(`Malformed OpenRouter rankings row at index ${index}`)

    return {
      date: row.date,
      model_permaslug: row.model_permaslug,
      total_tokens: row.total_tokens,
    }
  })
}

/**
 * The attribution string OpenRouter's dataset terms require wherever this
 * data is republished. `as_of` is not optional and cannot be hardcoded — it
 * comes from the payload.
 */
export const openRouterCitation = (asOf: string | Date | number) =>
  `Source: OpenRouter (openrouter.ai/rankings), as of ${
    typeof asOf === 'string' ? asOf : new Date(asOf).toISOString()
  }.`
