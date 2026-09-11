import { HOUR_MS } from 'common/util/time'
import {
  OSRS_BOND_ITEM_ID,
  OsrsBondWindow,
  checkBondAgainstGuidePrice,
  parseOsrsBondTimeseries,
  parseOsrsBondWindow,
  readJagexGuidePriceGp,
} from 'common/perps/osrs-bond'

import { log } from './utils'

// Old School RuneScape bond price adapter. What the price is, why it is the
// midpoint of a completed window rather than the last trade, and what this feed
// cannot defend against are all written up in common/perps/osrs-bond.ts, which
// also holds both payload parsers. This module is the network layer.
//
// SOURCES
//
//   GET https://prices.runescape.wiki/api/v1/osrs/5m?id=13190          (live)
//   GET https://prices.runescape.wiki/api/v1/osrs/timeseries?...       (backfill)
// The OSRS Wiki's real-time prices API, a documented public endpoint run by the
// wiki in partnership with RuneLite, whose client reports the trades it is
// built from. It asks users of automated tooling for a descriptive User-Agent
// with contact info, and publishes no rate limit beyond a reservation to cut
// off usage that threatens API stability — a poll a minute for one item is
// nowhere near that. The UA below is that request honoured; do not strip it.
//
//   GET https://secure.runescape.com/m=itemdb_oldschool/api/catalogue/detail.json?item=13190
// Jagex's own item database, used ONLY as an independent cross-check (see
// below). Keyless and public, and polled about hourly, which is as often as
// its guide price moves.
//
// WHY A CROSS-CHECK RATHER THAN A SECOND VOTE
//
// Every other fast feed in the registry gets its safety from agreement between
// independent venues, and this one cannot: the wiki is the only real-time
// source of Grand Exchange prices that exists. So the structure is the
// VoteHub canary's rather than BTC's — one source for the price, a second,
// independently computed number to refuse publishing against when the two
// disagree structurally.
//
// The canary FAILS OPEN when it cannot be reached and CLOSED when it answers
// and disagrees. That asymmetry is deliberate: Jagex's endpoint going down is
// not evidence about the bond's price, and freezing a market because a
// secondary source is unreachable would convert their outage into our incident.
// A canary that answers and disagrees by more than a quarter is evidence, and
// the feed pauses on it.

// Same budget and reasoning as btc-price.ts and fx-price.ts: comfortably under
// the 2s oracle tick, because dispatch skips a feed while its previous poll is
// in flight, so a hung request costs several ticks rather than one.
const FETCH_TIMEOUT_MS = 1_500

// The backfill is not on the tick, and asks for up to 365 windows in one
// response. Holding it to the tick's budget would make a perfectly healthy
// history fetch time out.
const BACKFILL_FETCH_TIMEOUT_MS = 30_000

// The wiki asks for a User-Agent that says what the traffic is for, with
// contact info. This is a courtesy the API's terms explicitly request, and the
// thing most likely to get us a heads-up before a breaking change rather than
// a block. Exported so a test fails if it is ever stripped back to a bare
// product string.
export const OSRS_WIKI_USER_AGENT =
  'Manifold perps oracle (+https://manifold.markets) - contact: support@manifold.markets'

/**
 * The endpoint the live feed reads, and the length of the window it serves.
 *
 * One endpoint, deliberately. An earlier draft fell back to `/1h` when a
 * five-minute window was too quiet to use, which is worse than useless: the
 * hourly window's END is OLDER than the last five-minute point we published for
 * up to an hour afterwards, so every fallback point would be refused by the
 * tick's "timestamp is not newer" check — and refused loudly, as an ERROR that
 * pages someone, on exactly the quiet mornings the fallback was meant to cover.
 *
 * So a quiet window publishes nothing and the mark ages; staleAfterMs (30m) and
 * the market's freshness gate are sized for that. If `/5m` turns out to be too
 * sparse for the bond in practice, switch these two constants to '1h' and 3600
 * — the parser takes the window length as a parameter precisely so that is a
 * one-line change rather than a second code path.
 */
const WINDOW_PATH = '5m'
const WINDOW_SECONDS = 300

export const OSRS_WIKI_BASE_URL = 'https://prices.runescape.wiki/api/v1/osrs'
export const JAGEX_ITEM_DETAIL_URL =
  'https://secure.runescape.com/m=itemdb_oldschool/api/catalogue/detail.json'

/**
 * How long a fetched Jagex guide price stays usable as the cross-check basis.
 *
 * Their guide price moves about once a day, so polling it on every bond tick
 * would spend ~1,400 requests a day on the same number. An hour-old guide price
 * is exactly as good a canary as a fresh one at this tolerance.
 */
const GUIDE_PRICE_CACHE_MS = HOUR_MS

let cachedGuidePrice: { gp: number; fetchedAt: number } | null = null

const fetchJson = async (
  url: string,
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<unknown> => {
  const res = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': OSRS_WIKI_USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`${url}: ${res.status} ${res.statusText}`)
  return res.json()
}

/**
 * The most recent completed window, or null when there is nothing publishable.
 *
 * Severity is taken from the parser's own verdict rather than guessed here: a
 * `quiet` window is an ordinary event and logs at info, while an `invalid`
 * payload — or an HTTP failure — is an incident and logs at ERROR, which is
 * what GCP alerts on. Getting that backwards in either direction is the whole
 * point of OsrsBondRejectionKind existing.
 */
const fetchLatestWindow = async (): Promise<OsrsBondWindow | null> => {
  let body: unknown
  try {
    body = await fetchJson(
      `${OSRS_WIKI_BASE_URL}/${WINDOW_PATH}?id=${OSRS_BOND_ITEM_ID}`
    )
  } catch (err) {
    log.error(`[osrs-bond] ${WINDOW_PATH} fetch failed — ${err}`)
    return null
  }

  const parsed = parseOsrsBondWindow(body, WINDOW_SECONDS)
  if (parsed.ok) return parsed.window
  if (parsed.kind === 'quiet') {
    log(`[osrs-bond] skipping window — ${parsed.reason}`)
    return null
  }
  log.error(`[osrs-bond] unusable ${WINDOW_PATH} payload — ${parsed.reason}`)
  return null
}

/**
 * Jagex's guide price, from cache when fresh. Returns null when it cannot be
 * obtained, which the caller treats as "no opinion" rather than a failure —
 * see the fails-open note at the top of this file.
 */
const fetchGuidePriceGp = async (now: number): Promise<number | null> => {
  if (
    cachedGuidePrice &&
    now - cachedGuidePrice.fetchedAt < GUIDE_PRICE_CACHE_MS
  )
    return cachedGuidePrice.gp

  try {
    const body = await fetchJson(
      `${JAGEX_ITEM_DETAIL_URL}?item=${OSRS_BOND_ITEM_ID}`
    )
    const gp = readJagexGuidePriceGp(body)
    if (gp == null) {
      log(`[osrs-bond] Jagex guide price unusable; skipping cross-check`)
      return null
    }
    cachedGuidePrice = { gp, fetchedAt: now }
    return gp
  } catch (err) {
    log(`[osrs-bond] Jagex guide price unavailable: ${err}`)
    return null
  }
}

/**
 * The oracle point: the midpoint of the latest completed window, stamped at the
 * window's END.
 *
 * Stamping at the window end rather than at fetch time is what keeps the
 * published series honest — the average describes 12:00-12:05, so it is a
 * 12:05 observation, not a 12:06 one — and it is also what makes the tick
 * idempotent: re-polling the same window produces the same (ts, price), which
 * `shouldWrite` and the unique index both collapse to nothing.
 */
export const fetchOsrsBondGp = async (): Promise<{
  ts: number
  price: number
  sourceTs: number
} | null> => {
  const window = await fetchLatestWindow()
  if (!window) return null

  const now = Date.now()
  const guidePrice = await fetchGuidePriceGp(now)
  const rejection = checkBondAgainstGuidePrice(window.price, guidePrice)
  if (rejection) {
    log.error(`[osrs-bond] refusing to publish: ${rejection}`)
    return null
  }

  log(
    `[osrs-bond] window ${new Date(window.windowStartMs).toISOString()} ` +
      `mid ${window.price} gp (buy ${window.avgHighPrice} x${window.highPriceVolume}, ` +
      `sell ${window.avgLowPrice} x${window.lowPriceVolume})`
  )

  return {
    ts: window.windowEndMs,
    price: window.price,
    sourceTs: window.windowStartMs,
  }
}

/** Window lengths, in seconds, for each timestep the timeseries route accepts. */
export const OSRS_TIMESERIES_WINDOW_SECONDS: Readonly<Record<string, number>> =
  {
    '5m': 300,
    '1h': 3_600,
    '6h': 21_600,
    '24h': 86_400,
  }

/**
 * Historical windows from the wiki's `/timeseries` route. BACKFILL ONLY.
 *
 * Returns up to 365 windows at the requested timestep, oldest first, each
 * validated by exactly the rules the live feed applies — so the seeded history
 * cannot contain a point the feed itself would have refused. Unusable windows
 * (one-sided, thin, dislocated) are skipped and reported, which is what the
 * live feed would have done with them too.
 *
 * ⚠️ The row field names are believed to match the `/5m` shape plus a per-row
 * `timestamp`; a live response could not be fetched from the environment this
 * was written in. If the volumes come back under different keys, every row is
 * reported as "unusable volumes" and nothing is written — loud and harmless.
 */
export const fetchOsrsBondHistory = async (
  timestep: string
): Promise<{ windows: OsrsBondWindow[]; skipped: string[] }> => {
  const windowSeconds = OSRS_TIMESERIES_WINDOW_SECONDS[timestep]
  if (windowSeconds == null)
    throw new Error(
      `unknown timestep ${timestep}; expected one of ${Object.keys(
        OSRS_TIMESERIES_WINDOW_SECONDS
      ).join(', ')}`
    )

  const body = await fetchJson(
    `${OSRS_WIKI_BASE_URL}/timeseries?timestep=${timestep}&id=${OSRS_BOND_ITEM_ID}`,
    BACKFILL_FETCH_TIMEOUT_MS
  )
  const parsed = parseOsrsBondTimeseries(body, windowSeconds)
  if (!parsed.ok)
    throw new Error(`OSRS bond timeseries rejected: ${parsed.reason}`)
  return { windows: parsed.windows, skipped: parsed.skipped }
}
