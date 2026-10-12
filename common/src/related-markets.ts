import { Contract } from './contract'

type RelatedMarketCandidate = Pick<
  Contract,
  'closeTime' | 'deleted' | 'isResolved' | 'mechanism' | 'visibility'
>

type IdentifiedRelatedMarketCandidate = RelatedMarketCandidate &
  Pick<Contract, 'id'>

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

/** Refetch cached IDs, preserve their ranked order, and discard IDs whose
 * current contract state is missing or no longer eligible. */
export const materializeEligibleRelatedMarkets = <
  T extends IdentifiedRelatedMarketCandidate
>(
  marketIds: readonly string[],
  currentContracts: readonly T[],
  now = Date.now()
) => {
  const contractsById = new Map(
    currentContracts.map((contract) => [contract.id, contract])
  )
  return marketIds
    .map((id) => contractsById.get(id))
    .filter(
      (contract): contract is T =>
        contract != null && isEligibleRelatedMarket(contract, now)
    )
}

/** Cache key for the model's "which of these candidates are near-duplicates"
 * verdict. Keyed on the candidate set rather than on time: as long as the
 * embedding search returns the same markets, the verdict is the same, so a
 * contract page can be re-rendered every few minutes without paying for the
 * model again. A newly published similar market changes the set and forces
 * a fresh pass. Order-insensitive because the search returns ties in an
 * unstable order. */
export const relatedMarketsFilterKey = (
  contractId: string,
  candidateIds: readonly string[]
) =>
  `related-markets-filter:v1:${contractId}:${[...candidateIds]
    .sort()
    .join(',')}`
