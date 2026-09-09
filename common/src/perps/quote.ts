// The live, fast-moving slice of a perp market: exactly the fields an oracle
// tick settles, and exactly the fields the trading UI must re-render to price
// a position correctly.
//
// Kept separate from PerpContract for two reasons: the tick push carries a
// couple hundred bytes instead of a whole contract, and the scheduler (which
// pushes), the API (which serves and rebroadcasts), and the client (which
// applies) all agree on one validated shape.
//
// Scope is deliberately narrow — price, price provenance, and pools. Two
// things are excluded on purpose:
//
//   - Open interest and the funding rate. A tick can move open interest (via
//     liquidations), but the push is assembled where only the pre-tick
//     snapshot is available, so pushing them would race the polled path and
//     sometimes overwrite fresher values with older ones. They stay polled.
//     Pools share that trade-mutability — a trade moves them at an UNCHANGED
//     oraclePriceTime — so the client applies only the price fields from a
//     quote and keeps pools on the polled path. Pools stay in the payload
//     because the tick does authoritatively settle them (liquidations move
//     pools) and the wire shape is useful for debugging and for any future
//     consumer that orders by arrival rather than by tick time.
//   - Resolution. Ticks only ever apply to live markets, so a quote can never
//     legitimately carry `isResolved`, and letting it patch that field would
//     risk un-resolving a settled market on the client.

import { z } from 'zod'

import { PerpContract } from 'common/contract'

export const oracleFeedHealthSchema = z
  .object({
    checkedAt: z.number().finite().positive(),
    status: z.enum(['available', 'unavailable']),
    reason: z.string().optional(),
    priceTime: z.number().finite().positive().optional(),
    price: z.number().finite().positive().optional(),
  })
  .strict()

export const perpQuoteSchema = z
  .object({
    contractId: z.string().min(1),
    oraclePrice: z.number().finite(),
    oraclePriceTime: z.number().finite().optional(),
    oracleSourceTime: z.number().finite().nullish(),
    oracleFeedHealth: oracleFeedHealthSchema.optional(),
    poolLong: z.number().finite(),
    poolShort: z.number().finite(),
  })
  .strict()

export type PerpQuote = z.infer<typeof perpQuoteSchema>

/** Snapshot the live fields of a contract as a quote. */
export const getPerpQuote = (contract: PerpContract): PerpQuote => ({
  contractId: contract.id,
  ...(contract.oracleFeedHealth
    ? { oracleFeedHealth: contract.oracleFeedHealth }
    : {}),
  oraclePrice: contract.oraclePrice,
  poolLong: contract.poolLong,
  poolShort: contract.poolShort,
  ...(contract.oraclePriceTime != null
    ? { oraclePriceTime: contract.oraclePriceTime }
    : {}),
  ...(contract.oracleSourceTime != null
    ? { oracleSourceTime: contract.oracleSourceTime }
    : {}),
})

/**
 * Whether `nextTime` is a strictly newer observation than `currentTime`.
 *
 * Every consumer of a quote needs this guard: pushes and polls race, a
 * reconnecting socket can replay, and a poll can return a body older than a
 * tick already applied. Ordering on the oracle timestamp (not arrival order)
 * is what keeps the displayed price monotonic in market time.
 *
 * A quote with no timestamp can never displace one that has it.
 */
export const isNewerPerpQuote = (
  currentTime: number | undefined | null,
  nextTime: number | undefined | null
) => {
  if (nextTime == null) return currentTime == null
  if (currentTime == null) return true
  return nextTime > currentTime
}

/** Health-only updates must survive an unchanged price; old price packets must
 * not erase a newer frozen flag. */
export const mergePerpQuotes = (
  previous: PerpQuote | null,
  incoming: PerpQuote
): PerpQuote => {
  if (!previous) return incoming
  const price = isNewerPerpQuote(
    previous.oraclePriceTime,
    incoming.oraclePriceTime
  )
    ? incoming
    : previous
  const health =
    (incoming.oracleFeedHealth?.checkedAt ?? 0) >
    (previous.oracleFeedHealth?.checkedAt ?? 0)
      ? incoming.oracleFeedHealth
      : previous.oracleFeedHealth
  // Keep React's state bailout for duplicate or older quote packets.
  if (health === price.oracleFeedHealth) return price
  return { ...price, ...(health ? { oracleFeedHealth: health } : {}) }
}
