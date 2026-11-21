// How web/scripts/election-2026-replay-comparisons.ts reads a real-money
// market's price from its 1-minute order book, kept pure so it is tested.

// A book wider than this (10¢) says nothing about the price: a closed
// market's empty book reads $0 bid and $1 ask, a meaningless 50%.
export const MAX_QUOTE_SPREAD = 0.1

// The midpoint of a minute's best bid and ask, or undefined when the book is
// unusable: a side missing or out of [0, 1], crossed, or wider than 10¢.
export function usableMid(bid: number | undefined, ask: number | undefined) {
  if (bid === undefined || ask === undefined) return undefined
  if (!Number.isFinite(bid) || !Number.isFinite(ask)) return undefined
  if (bid < 0 || ask > 1 || bid > ask) return undefined
  if (ask - bid > MAX_QUOTE_SPREAD) return undefined
  return (bid + ask) / 2
}

export type Quote = { at: number; prob: number }

// [frame time, price] at each frame: the last usable quote at or before it.
// While the market trades, a quote older than `maxAgeMs` is left out. From
// `closedAt` (when trading closed) on, the market's last price before the
// close holds: the page marks those frames closed. Quotes ascending.
export function quotesAtFrames(
  times: number[],
  quotes: Quote[],
  maxAgeMs: number,
  closedAt?: number
): [number, number][] {
  const before = quotes.filter((q) => closedAt === undefined || q.at < closedAt)
  const points: [number, number][] = []
  let next = 0
  let last: Quote | undefined
  for (const time of times) {
    while (next < before.length && before[next].at <= time)
      last = before[next++]
    const closed = closedAt !== undefined && time >= closedAt
    if (last && (closed || time - last.at <= maxAgeMs))
      points.push([time, Math.round(last.prob * 10_000) / 10_000])
  }
  return points
}
