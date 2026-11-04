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
      'Real money: the midpoint of the best bid and ask for the Republican contract on a real-money prediction market, in the last minute before each moment.',
  },
}

export const comparisonLabel = (source: string) =>
  COMPARISON_SOURCES[source]?.label ?? source

export const REPLAY_COMPARISONS = (data as ReplayComparisonsFile).series

export type ComparisonQuote = { source: string; republicanProb: number }

// Each source's price at exactly this frame time. A snapshot extended
// without rerunning the comparisons has no price at its new frames.
export function comparisonsAt(
  series: ComparisonSeries[],
  chamber: ReplayChamber,
  time: number
): ComparisonQuote[] {
  return series.flatMap((s) => {
    const point = s.chambers[chamber]?.find(([t]) => t === time)
    return point && Number.isFinite(point[1])
      ? [{ source: s.source, republicanProb: point[1] }]
      : []
  })
}
