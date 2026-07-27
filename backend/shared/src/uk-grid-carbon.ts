import { log } from './utils'

// GB grid carbon intensity (gCO2/kWh) from the official NESO API
// (https://carbonintensity.org.uk). Free, no auth. Data comes in 30-minute
// settlement blocks with both a forecast and (once the block is finalized) an
// actual. The oracle tracks the latest ACTUAL: the forecast is public, so
// traders can bet against it — that asymmetry is the market.

const API_BASE = 'https://api.carbonintensity.org.uk'
const FETCH_TIMEOUT_MS = 10_000

type IntensityBlock = {
  from: string // ISO, e.g. 2026-07-02T09:30Z
  to: string
  intensity: {
    forecast: number | null
    actual: number | null
    index: string
  }
}

/** NESO's documented timestamp format: YYYY-MM-DDTHH:MMZ (no seconds/ms). */
export const toNesoIso = (ms: number) =>
  new Date(ms).toISOString().slice(0, 16) + 'Z'

export const fetchIntensityBlocks = async (
  fromIso: string,
  toIso: string
): Promise<IntensityBlock[]> => {
  const res = await fetch(`${API_BASE}/intensity/${fromIso}/${toIso}`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok)
    throw new Error(`carbonintensity API: ${res.status} ${res.statusText}`)
  const body = (await res.json()) as { data: IntensityBlock[] }
  return body.data ?? []
}

// Latest finalized block in the trailing 24h. The in-progress block's actual
// is null until NESO settles it, so this naturally lags ~30–60 min — that's
// the feed's real cadence and the market's maxOraclePriceAgeMs must allow it.
export const fetchUkGridCarbonActual = async (): Promise<{
  ts: number
  price: number
} | null> => {
  const now = Date.now()
  const blocks = await fetchIntensityBlocks(
    toNesoIso(now - 24 * 60 * 60 * 1000),
    toNesoIso(now)
  )

  const finalized = blocks.filter(
    (b) => b.intensity.actual != null && isFinite(b.intensity.actual)
  )
  if (finalized.length === 0) {
    log('[uk-grid-carbon] no finalized blocks in the last 24h')
    return null
  }
  const latest = finalized.reduce((a, b) =>
    Date.parse(a.to) > Date.parse(b.to) ? a : b
  )
  // Clamp: a block's `to` can nominally sit a few minutes ahead of wall time
  // if NESO settles early, and oraclePriceTime should never lead the clock.
  const ts = Math.min(Date.parse(latest.to), now)
  return { ts, price: latest.intensity.actual as number }
}

// Every finalized block in the trailing window, oldest first. NESO settles
// actuals late and in batches (observed from 2026-07-25): a batch can
// finalize the 06:00→06:30 block AFTER the 06:30→07:00 block, so a
// latest-only sampler permanently drops the interleaved block — the live
// feed degraded to hourly while the source still had full 30-min data.
// Upserting the whole window each tick is idempotent and self-healing.
const RECENT_WINDOW_MS = 6 * 60 * 60 * 1000

export const fetchUkGridCarbonRecent = async (): Promise<
  { ts: number; price: number }[]
> => {
  const now = Date.now()
  const blocks = await fetchIntensityBlocks(
    toNesoIso(now - RECENT_WINDOW_MS),
    toNesoIso(now)
  )
  return blocks
    .filter((b) => b.intensity.actual != null && isFinite(b.intensity.actual))
    .map((b) => ({
      // Same clamp as above: only the newest block can lead wall time.
      ts: Math.min(Date.parse(b.to), now),
      price: b.intensity.actual as number,
    }))
    .sort((a, b) => a.ts - b.ts)
}
