// The key of the contract edit a resolution records (resolveMarketHelper): the
// market as that resolution found it, written in the resolution's own
// transaction. It names the resolution by what it resolved (one answer of an
// independent multiple choice market, or the whole market) and when, which is
// the resolutionTime it wrote to that answer or market.
//
// Unresolving reads what to put back of the pending subsidy the resolution
// took from this edit and no other. The latest edit on file can be another
// resolution's, whose subsidy has since been paid out or moved into the pools.
export const getResolutionEditKey = (
  answerId: string | undefined,
  resolutionTime: number
) => `resolution:${answerId ?? 'market'}:${resolutionTime}`
