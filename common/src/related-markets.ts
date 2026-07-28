import { Contract } from './contract'

type RelatedMarketCandidate = Pick<
  Contract,
  'closeTime' | 'deleted' | 'isResolved' | 'mechanism' | 'visibility'
>

/** Eligibility that must be rechecked whenever cached related-market IDs are
 * materialized. Embedding membership can outlive publication, closure,
 * resolution, or deletion changes. */
export const isEligibleRelatedMarket = (
  contract: RelatedMarketCandidate,
  now = Date.now()
) =>
  contract.visibility === 'public' &&
  !contract.deleted &&
  !contract.isResolved &&
  (contract.closeTime != null
    ? contract.closeTime > now
    : contract.mechanism === 'perp')
