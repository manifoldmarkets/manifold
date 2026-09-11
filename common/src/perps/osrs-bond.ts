// The Old School RuneScape bond, priced in gp, mirrored as an oracle price.
//
// This file is the published methodology for the feed and the parser for both
// provider payloads. Like the Fear & Greed and VoteHub methodology files it
// lives in `common` so the rule the oracle is scored against is one auditable
// artifact, and so the parsers are unit-tested where the repo has a runner.
//
// WHAT THE PRICE IS
//
// The midpoint of the Old School RuneScape Grand Exchange's instant-buy and
// instant-sell averages for a bond (item 13190) over one completed trading
// window, in gp. At the time of writing that is about 12.2M gp.
//
// A bond is bought from Jagex for real money and traded in-game for gp, so its
// gp price is the market's own read on what gold is worth — it goes UP when gp
// inflates or membership demand rises, and DOWN when gold gets scarcer or an
// update dumps wealth into the economy. That makes it genuinely two-sided
// rather than a one-way inflation ratchet: over the year to September 2026 it
// fell about 23%, from a 16.4M January high to an 11.3M low. (The README's
// "monotone feeds make bad perps" rule is what disqualifies the obvious
// alternative — a tokenised T-bill NAV — and is exactly what this feed had to
// be checked against.)
//
// WHY THE MIDPOINT, NOT THE TRADED AVERAGE
//
// The bond's bid/ask spread is wide: ~367k on a 12.0M mid, about 3%. The wiki
// window gives an average instant-buy price, an average instant-sell price,
// and the volume on each side, so there are two candidate marks:
//
//   - A volume-weighted average of all trades in the window. Honest as a
//     statement of what people paid, and wrong as a mark: it slides across a
//     3% band with the flow mix, so a buy-heavy window prints near the ask and
//     a sell-heavy one near the bid. That jitter is not information, and a perp
//     that executes at the mark with no spread pays anyone who can predict the
//     next window's flow direction.
//   - The unweighted midpoint of the two averages. Flow-neutral, and it only
//     moves when the market's actual level moves.
//
// The midpoint wins, and the cost is stated plainly: it requires BOTH sides to
// have traded in the window (see the volume floor below), so a one-sided window
// publishes nothing and the mark ages until the next one.
//
// WINDOW, NOT LAST TRADE
//
// The wiki also serves a `/latest` endpoint carrying the single most recent
// instant-buy and instant-sell price. Not used: one trade is one player, and on
// an item where a market order moves the price, a mark defined by the last
// print is a mark anyone can set. A five-minute two-sided average costs up to
// ten minutes of latency (the window plus its publication) and buys
// manipulation resistance that no poll rate can substitute for. Bonds move
// slowly relative to their own spread, so that trade is clearly worth making
// here in a way it would not be for BTC.
//
// WHAT THIS FEED CANNOT DEFEND AGAINST
//
// A player wealthy enough to move the Grand Exchange can move this mark, and
// unlike every other feed in the registry, doing so is a game mechanic rather
// than market abuse. The 3% spread and the two-sided volume floor make it
// expensive — you must trade both sides of a 12M-gp item in size, repeatedly,
// inside one five-minute window — but "expensive" is not "impossible". A perp
// on this feed should carry conservative leverage and modest backing, and is a
// play-money curiosity by design, not a serious hedging instrument.

/** Old school bond, in both the wiki's item ids and Jagex's. */
export const OSRS_BOND_ITEM_ID = 13190

/**
 * Hard plausibility band for a parsed gp price, applied before it can become a
 * vote or a cross-check.
 *
 * Wide on purpose, like every other source-level band in the registry: bonds
 * have traded from roughly 2M gp (2015) to 16.4M (January 2026), and a feed
 * that refuses a real level is worse than useless. What this catches is unit
 * confusion — a price served in millions (12.2), in thousands, or as a
 * percentage — and the sentinel zero Jagex's own API returns for an item with
 * no movement today.
 */
export const MIN_PLAUSIBLE_BOND_GP = 100_000
export const MAX_PLAUSIBLE_BOND_GP = 1_000_000_000

export const isPlausibleBondGp = (gp: number) =>
  Number.isFinite(gp) &&
  gp >= MIN_PLAUSIBLE_BOND_GP &&
  gp <= MAX_PLAUSIBLE_BOND_GP

/**
 * Minimum trades on EACH side of a window for its midpoint to count.
 *
 * A side with one trade behind it is one player's price, and the midpoint would
 * inherit it. Five is low enough that a quiet window still publishes — bonds
 * turn over constantly — and high enough that no single order defines the mark.
 * A window that fails this is skipped, not clamped: the next window is five
 * minutes away and the market's freshness gate covers the gap.
 */
export const MIN_BOND_WINDOW_VOLUME_PER_SIDE = 5

/**
 * Widest instant-buy/instant-sell gap, as a fraction of the midpoint, that
 * still describes one market.
 *
 * The normal spread is ~3%. A gap several times that means the window caught
 * a dislocation rather than a level — a crash in progress, or one side's
 * average dragged by a stale-but-technically-in-window print — and the
 * midpoint of a dislocated pair is a number nobody traded at. 30% only ever
 * fires on something genuinely broken, and when it does the feed pauses rather
 * than publishing an invented level.
 */
export const MAX_BOND_SPREAD_FRAC = 0.3

/**
 * How far the wiki's midpoint may sit from Jagex's own guide price before we
 * refuse to publish.
 *
 * This is the feed's only independent check, and the reason it needs one: the
 * wiki's real-time prices are crowdsourced from game clients, so unlike BTC
 * there is no second venue to agree with. Jagex publishes its own guide price
 * from its own trade data, computed differently and updated roughly daily.
 *
 * The band is wide — 25% — because the two numbers legitimately differ: Jagex's
 * guide price lags by up to a day or more, and a real 15% week would otherwise
 * freeze the feed. That is the deliberate trade: this catches a wiki payload
 * that has gone structurally wrong (an item id remapped, a units change, a
 * mass of bad client reports), not a fast move. It also self-heals, which is
 * the property the README demands of any divergence check — Jagex's guide price
 * refreshes on its own, so a genuine move stops tripping it within a day
 * instead of wedging on a stale comparison basis forever.
 */
export const MAX_BOND_CROSS_CHECK_GAP_FRAC = 0.25

export type OsrsBondWindow = {
  /** Midpoint of the two averages, in gp — the oracle price. */
  price: number
  /** Average instant-buy price in the window. */
  avgHighPrice: number
  /** Average instant-sell price in the window. */
  avgLowPrice: number
  highPriceVolume: number
  lowPriceVolume: number
  /** Window START, epoch ms — the provider's own stamp for the observation. */
  windowStartMs: number
  /** Window END, epoch ms. The point's `ts`: the earliest instant at which the
   * average describes the whole window. */
  windowEndMs: number
}

/**
 * Why a window could not be used, and whether anyone should be woken for it.
 *
 * The distinction is load-bearing rather than cosmetic. A window where one side
 * did not trade, or traded under the volume floor, is a QUIET market — routine,
 * expected several times a day, and the correct response is to publish nothing
 * and wait. A payload that is crossed, mis-typed, missing the item, or
 * dislocated is INVALID: something changed at the source, and that is an
 * incident. Collapsing the two would either page an operator for a quiet
 * Tuesday morning or hide a genuine source failure in the noise of ordinary
 * skips — and since the oracle tick turns `log.error` into a GCP alert, the
 * choice of severity here is what decides which.
 */
export type OsrsBondRejectionKind = 'quiet' | 'invalid'

export type OsrsBondParseResult =
  | { ok: true; window: OsrsBondWindow }
  | { ok: false; kind: OsrsBondRejectionKind; reason: string }

export type OsrsBondSeriesParseResult =
  | { ok: true; windows: OsrsBondWindow[]; skipped: string[] }
  | { ok: false; kind: OsrsBondRejectionKind; reason: string }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === 'object' && !Array.isArray(value)

/**
 * Parse one window from the OSRS Wiki real-time prices `/5m` or `/1h` payload,
 * treating every field as untrusted.
 *
 * Shape (per the wiki's documented API; a live response could not be fetched
 * from the environment this feed was written in, so the adapter's endpoint and
 * this shape are an operator gate before a market is created):
 *
 *   { "data": { "13190": { "avgHighPrice": 12200000, "highPriceVolume": 123,
 *                          "avgLowPrice": 11830000, "lowPriceVolume": 98 } },
 *     "timestamp": 1757548800 }
 *
 * `timestamp` is the window's START in unix seconds; `windowSeconds` is how
 * long the window runs (300 for /5m, 3600 for /1h) and is supplied by the
 * caller because the payload does not say. Either average may be null when
 * nothing traded on that side, which is a skip, not an error.
 */
export const parseOsrsBondWindow = (
  body: unknown,
  windowSeconds: number,
  itemId: number = OSRS_BOND_ITEM_ID
): OsrsBondParseResult => {
  if (!Number.isInteger(windowSeconds) || windowSeconds <= 0)
    return {
      ok: false,
      kind: 'invalid',
      reason: `invalid window length ${windowSeconds}s`,
    }
  if (!isRecord(body))
    return { ok: false, kind: 'invalid', reason: 'payload is not an object' }

  const windowStartSeconds = toPositiveInteger(body.timestamp)
  if (windowStartSeconds == null)
    return {
      ok: false,
      kind: 'invalid',
      reason: `payload timestamp ${JSON.stringify(
        body.timestamp
      )} is not unix seconds`,
    }

  const data = body.data
  if (!isRecord(data))
    return {
      ok: false,
      kind: 'invalid',
      reason: 'payload `data` is not an object',
    }
  const row = data[String(itemId)]
  if (row === undefined)
    return {
      ok: false,
      kind: 'invalid',
      reason: `payload has no row for item ${itemId}`,
    }

  return parseOsrsBondRow(row, windowStartSeconds, windowSeconds, itemId)
}

/**
 * Parse the `/timeseries` payload — the same window shape, one row per window,
 * each carrying its own `timestamp` (window start, unix seconds).
 *
 * Unusable rows are SKIPPED and reported, not fatal, which is the opposite of
 * the Fear & Greed parser's all-or-nothing stance and right for a different
 * reason: a one-sided or thin window is a normal event over a year of history,
 * and the live feed would have published nothing for it either. Dropping such a
 * row reproduces what the feed would have done; rejecting the batch would mean
 * no history at all. A payload with no usable row is still an error.
 */
export const parseOsrsBondTimeseries = (
  body: unknown,
  windowSeconds: number,
  itemId: number = OSRS_BOND_ITEM_ID
): OsrsBondSeriesParseResult => {
  if (!Number.isInteger(windowSeconds) || windowSeconds <= 0)
    return {
      ok: false,
      kind: 'invalid',
      reason: `invalid window length ${windowSeconds}s`,
    }
  if (!isRecord(body))
    return { ok: false, kind: 'invalid', reason: 'payload is not an object' }
  const data = body.data
  if (!Array.isArray(data))
    return {
      ok: false,
      kind: 'invalid',
      reason: 'payload `data` is not an array',
    }

  const windows: OsrsBondWindow[] = []
  const skipped: string[] = []
  for (let index = 0; index < data.length; index++) {
    const row: unknown = data[index]
    if (!isRecord(row)) {
      skipped.push(`row ${index} is not an object`)
      continue
    }
    const windowStartSeconds = toPositiveInteger(row.timestamp)
    if (windowStartSeconds == null) {
      skipped.push(
        `row ${index} timestamp ${JSON.stringify(
          row.timestamp
        )} is not unix seconds`
      )
      continue
    }
    const parsed = parseOsrsBondRow(
      row,
      windowStartSeconds,
      windowSeconds,
      itemId
    )
    if (parsed.ok) windows.push(parsed.window)
    else skipped.push(parsed.reason)
  }

  if (windows.length === 0)
    return {
      ok: false,
      kind: 'invalid',
      reason: `no usable window in ${data.length} row(s)${
        skipped.length > 0 ? `: ${skipped.slice(0, 3).join(' | ')}` : ''
      }`,
    }

  windows.sort((a, b) => a.windowStartMs - b.windowStartMs)
  return { ok: true, windows, skipped }
}

/**
 * Validate one window's numbers, whichever endpoint they arrived from. Every
 * rule that decides whether a window can be a mark lives here so `/5m`, `/1h`
 * and `/timeseries` cannot drift apart — a backfill validated more loosely
 * than the live feed would seed history the feed itself would never publish.
 */
const parseOsrsBondRow = (
  row: unknown,
  windowStartSeconds: number,
  windowSeconds: number,
  itemId: number
): OsrsBondParseResult => {
  if (!isRecord(row))
    return {
      ok: false,
      kind: 'invalid',
      reason: `item ${itemId} row is not an object`,
    }

  // A null average means that side did not trade in this window. Skipping is
  // correct and expected; it must not read as a corrupt payload.
  if (row.avgHighPrice == null || row.avgLowPrice == null)
    return {
      ok: false,
      kind: 'quiet',
      reason: `item ${itemId} window has a one-sided average (avgHighPrice=${JSON.stringify(
        row.avgHighPrice
      )}, avgLowPrice=${JSON.stringify(row.avgLowPrice)})`,
    }

  const avgHighPrice = toPositiveInteger(row.avgHighPrice)
  const avgLowPrice = toPositiveInteger(row.avgLowPrice)
  if (avgHighPrice == null || avgLowPrice == null)
    return {
      ok: false,
      kind: 'invalid',
      reason: `item ${itemId} window has unusable averages (avgHighPrice=${JSON.stringify(
        row.avgHighPrice
      )}, avgLowPrice=${JSON.stringify(row.avgLowPrice)})`,
    }

  // Instant-buy below instant-sell is a crossed market: impossible in the
  // Grand Exchange's own mechanics, so the payload is wrong.
  if (avgHighPrice < avgLowPrice)
    return {
      ok: false,
      kind: 'invalid',
      reason: `item ${itemId} window is crossed: instant-buy ${avgHighPrice} below instant-sell ${avgLowPrice}`,
    }

  const highPriceVolume = toNonNegativeInteger(row.highPriceVolume)
  const lowPriceVolume = toNonNegativeInteger(row.lowPriceVolume)
  if (highPriceVolume == null || lowPriceVolume == null)
    return {
      ok: false,
      kind: 'invalid',
      reason: `item ${itemId} window has unusable volumes (highPriceVolume=${JSON.stringify(
        row.highPriceVolume
      )}, lowPriceVolume=${JSON.stringify(row.lowPriceVolume)})`,
    }
  if (
    highPriceVolume < MIN_BOND_WINDOW_VOLUME_PER_SIDE ||
    lowPriceVolume < MIN_BOND_WINDOW_VOLUME_PER_SIDE
  )
    return {
      ok: false,
      kind: 'quiet',
      reason: `item ${itemId} window is too thin: ${highPriceVolume} buys / ${lowPriceVolume} sells, need ${MIN_BOND_WINDOW_VOLUME_PER_SIDE} each`,
    }

  const price = (avgHighPrice + avgLowPrice) / 2
  if (!isPlausibleBondGp(price))
    return {
      ok: false,
      kind: 'invalid',
      reason: `item ${itemId} midpoint ${price} outside plausible [${MIN_PLAUSIBLE_BOND_GP}, ${MAX_PLAUSIBLE_BOND_GP}] gp`,
    }
  if (avgHighPrice - avgLowPrice > price * MAX_BOND_SPREAD_FRAC)
    return {
      ok: false,
      kind: 'invalid',
      reason: `item ${itemId} window spread ${
        avgHighPrice - avgLowPrice
      } exceeds ${MAX_BOND_SPREAD_FRAC * 100}% of midpoint ${price}`,
    }

  const windowStartMs = windowStartSeconds * 1000
  const windowEndMs = (windowStartSeconds + windowSeconds) * 1000
  return {
    ok: true,
    window: {
      price,
      avgHighPrice,
      avgLowPrice,
      highPriceVolume,
      lowPriceVolume,
      windowStartMs,
      windowEndMs,
    },
  }
}

/**
 * Parse a gp price from Jagex's own item database, which serves it as a
 * human-formatted string.
 *
 * Seen forms: `12200000`, `"12,200,000"`, `"12.2m"`, `"900.5k"`, `"2.1b"`, and
 * for a day's move `"- 50.0k"` or `"+ 1.2m"`. Returns gp, or null.
 *
 * Only used for the cross-check, never as the price: the suffix form throws
 * away precision (12.2m is any value in a 50k band), which is fine for asking
 * "is the wiki roughly right" and useless as a mark.
 */
export const parseJagexGuidePriceGp = (raw: unknown): number | null => {
  if (typeof raw === 'number')
    return Number.isFinite(raw) && raw > 0 ? raw : null
  if (typeof raw !== 'string') return null
  const text = raw.replace(/,/g, '').replace(/\s+/g, '').toLowerCase()
  const match = /^([+-]?)(\d+(?:\.\d+)?)([kmb]?)$/.exec(text)
  if (!match) return null
  const [, sign, digits, suffix] = match
  const magnitude =
    suffix === 'k' ? 1e3 : suffix === 'm' ? 1e6 : suffix === 'b' ? 1e9 : 1
  const value = Number(digits) * magnitude * (sign === '-' ? -1 : 1)
  return Number.isFinite(value) && value > 0 ? value : null
}

/**
 * Read Jagex's guide price out of the itemdb `catalogue/detail.json` payload.
 *
 * Shape: `{ "item": { "id": 13190, "current": { "trend": "…",
 * "price": "12.2m" }, "today": { … } } }`. The item id is checked, because a
 * guide price for the wrong item is exactly the kind of silent mismatch a
 * cross-check exists to catch — it would be comparing two different markets
 * and calling them consistent.
 */
export const readJagexGuidePriceGp = (
  body: unknown,
  itemId: number = OSRS_BOND_ITEM_ID
): number | null => {
  if (!isRecord(body)) return null
  const item = body.item
  if (!isRecord(item)) return null
  const servedId = toPositiveInteger(item.id)
  if (servedId !== itemId) return null
  const current = item.current
  if (!isRecord(current)) return null
  const price = parseJagexGuidePriceGp(current.price)
  return price != null && isPlausibleBondGp(price) ? price : null
}

/**
 * Does the wiki midpoint agree with Jagex's guide price closely enough to
 * publish? Returns a rejection reason, or null when the pair is acceptable (or
 * when there is no guide price to compare against — see the note on
 * MAX_BOND_CROSS_CHECK_GAP_FRAC, and the adapter, for why an ABSENT canary
 * must not stop the feed).
 */
export const checkBondAgainstGuidePrice = (
  price: number,
  guidePrice: number | null,
  maxGapFrac = MAX_BOND_CROSS_CHECK_GAP_FRAC
): string | null => {
  if (guidePrice == null) return null
  if (!Number.isFinite(price) || price <= 0) return `invalid price ${price}`
  if (!Number.isFinite(guidePrice) || guidePrice <= 0)
    return `invalid guide price ${guidePrice}`
  // Relative to the GUIDE price, which is the independent quantity: dividing
  // by our own candidate would let a wildly wrong candidate shrink its own
  // apparent error.
  const gap = Math.abs(price - guidePrice) / guidePrice
  if (gap > maxGapFrac)
    return `midpoint ${price} differs from Jagex guide price ${guidePrice} by ${(
      gap * 100
    ).toFixed(1)}%, over the ${maxGapFrac * 100}% cross-check tolerance`
  return null
}

/** Strict positive integer, from a number or a decimal string. */
const toPositiveInteger = (raw: unknown): number | null => {
  const value = toFiniteNumber(raw)
  if (value == null || !Number.isInteger(value) || value <= 0) return null
  return value
}

/** Strict non-negative integer — volumes legitimately come back as 0. */
const toNonNegativeInteger = (raw: unknown): number | null => {
  const value = toFiniteNumber(raw)
  if (value == null || !Number.isInteger(value) || value < 0) return null
  return value
}

const toFiniteNumber = (raw: unknown): number | null => {
  let value: number
  if (typeof raw === 'number') value = raw
  else if (typeof raw === 'string') {
    const trimmed = raw.trim()
    // Number('') is 0 and Number(' ') is 0, so emptiness has to be rejected
    // before the coercion, not after.
    if (trimmed === '') return null
    value = Number(trimmed)
  } else return null
  return Number.isFinite(value) ? value : null
}
