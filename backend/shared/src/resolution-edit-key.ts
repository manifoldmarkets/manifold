// The key of the contract edit a resolution records (recordContractEdit): the
// market as that resolution found it. It names the resolution by what it
// resolved (one answer of an independent multiple choice market, or the whole
// market) and when, which is the resolutionTime it wrote to that answer or
// market.
//
// Unresolving reads the pending subsidy to restore from this edit and no
// other. Edits are written after the resolution commits, so the latest one on
// file can be an earlier resolution's, whose subsidy has since been paid out
// or moved into the pools.
export const getResolutionEditKey = (
  answerId: string | undefined,
  resolutionTime: number
) => `resolution:${answerId ?? 'market'}:${resolutionTime}`
