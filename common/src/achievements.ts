export type RanksType = {
  creatorTraders: { rank: number | null; percentile: number | null }
  totalReferrals: { rank: number | null; percentile: number | null }
  totalReferredProfit: { rank: number | null; percentile: number | null }
  volume: { rank: number | null; percentile: number | null }
  trades: { rank: number | null; percentile: number | null }
  marketsCreated: { rank: number | null; percentile: number | null }
  comments: { rank: number | null; percentile: number | null }
  seasonsPlatinumOrHigher: { rank: number | null; percentile: number | null }
  seasonsDiamondOrHigher: { rank: number | null; percentile: number | null }
  seasonsMasters: { rank: number | null; percentile: number | null }
  largestLeagueSeasonEarnings: {
    rank: number | null
    percentile: number | null
  }
  liquidity: { rank: number | null; percentile: number | null }
  profitableMarkets: { rank: number | null; percentile: number | null }
  unprofitableMarkets: { rank: number | null; percentile: number | null }
  largestProfitableTrade: {
    rank: number | null
    percentile: number | null
  }
  largestUnprofitableTrade: {
    rank: number | null
    percentile: number | null
  }
  accountAge: { rank: number | null; percentile: number | null }
  longestBettingStreak: { rank: number | null; percentile: number | null }
  modTickets: { rank: number | null; percentile: number | null }
  charityDonated: { rank: number | null; percentile: number | null }
}
