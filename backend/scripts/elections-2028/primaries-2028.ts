// Seed data for each party's 2028 primary in every 2028 U.S. Senate and
// governor race (Tod, 6 Nov 2026: "a few people + Other with the ability to
// add answers"). Researched from public reporting in November 2026; the
// candidates are starting points, and anyone can add more on the market.
//
// party: one market per party ("who will be the nominee"). top-two/top-four:
// one market per race ("who finishes first in the primary").

export type DownballotRace = {
  // 2028 unless set: Minnesota's Senate special is in 2027 (Minn. Stat.
  // 204D.28 holds it at the next November election, odd years included).
  year?: 2027 | 2028
  office: 'senate' | 'governor'
  state: string
  code: string
  special?: boolean
  system: 'party' | 'top-two' | 'top-four'
  // ISO date of the primary (or the runoff, where one decides the nominee);
  // markets close the day after. Unknown: the default close.
  decidedBy?: string
  markets: {
    party: 'Democratic' | 'Republican' | null
    candidates: { name: string; pct: number }[]
  }[]
  // Why these names and odds, in a sentence (the seed's basis).
  note: string
}

export const DOWNBALLOT_2028: DownballotRace[] = []
