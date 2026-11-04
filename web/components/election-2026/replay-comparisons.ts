import data from 'web/public/data/election-2026-comparisons.json'

// Other markets' odds on the headline questions at each frame of the
// replay, shown beside Manifold's. Kalshi's series comes from
// web/scripts/election-2026-replay-comparisons.ts.

export type ReplayChamber = 'senate' | 'house'

export type ComparisonSeries = {
  source: string
  // When the prices were read, as an ISO time.
  retrievedAt: string
  // [frame time, chance Republicans win the chamber] at each frame with a
  // price, ascending.
  chambers: { [chamber in ReplayChamber]?: [number, number][] }
  // When each chamber's market closed for trading (ms). From then on its
  // price is the last one before the close.
  closedAt?: { [chamber in ReplayChamber]?: number }
}

export type ReplayComparisonsFile = { series: ComparisonSeries[] }

// How the page names each source, and how its price at a moment is read,
// for the table's notes. The data keeps the real source.
export const COMPARISON_SOURCES: {
  [source: string]: { label: string; method: string }
} = {
  Kalshi: {
    label: 'Real money',
    method:
      'Real money: the midpoint of the best bid and ask for the Republican contract on a real-money prediction market, in the last minute before each moment with bids and offers within 10¢ of each other. It closed for trading once the result was clear; from then on, “closed” marks its last price before the close.',
  },
}

export const comparisonLabel = (source: string) =>
  COMPARISON_SOURCES[source]?.label ?? source

export const REPLAY_COMPARISONS = (data as ReplayComparisonsFile).series

export type ComparisonQuote = {
  source: string
  republicanProb: number
  // The market had closed for trading: this is its last price before then.
  closed: boolean
}

// Each source's price at exactly this frame time. A snapshot extended
// without rerunning the comparisons has no price at its new frames, except
// for a market that had closed by then: its last price before the close
// still holds (the page's live Latest frame, past the series' end).
export function comparisonsAt(
  series: ComparisonSeries[],
  chamber: ReplayChamber,
  time: number
): ComparisonQuote[] {
  return series.flatMap((s) => {
    const points = s.chambers[chamber]
    const closedAt = s.closedAt?.[chamber]
    const last = points?.[points.length - 1]
    const point =
      points?.find(([t]) => t === time) ??
      (last && closedAt !== undefined && closedAt <= time && last[0] < time
        ? last
        : undefined)
    return point && Number.isFinite(point[1])
      ? [
          {
            source: s.source,
            republicanProb: point[1],
            closed: closedAt !== undefined && time >= closedAt,
          },
        ]
      : []
  })
}

// "Real money", or "Real money (closed)" once its market stopped trading.
export const quoteLabel = (quote: ComparisonQuote) =>
  `${comparisonLabel(quote.source)}${quote.closed ? ' (closed)' : ''}`
