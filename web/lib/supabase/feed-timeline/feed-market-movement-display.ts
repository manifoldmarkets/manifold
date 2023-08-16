import { Contract } from 'common/contract'
import { FEED_DATA_TYPES } from 'common/feed'
import { DAY_MS } from 'common/util/time'

export const getMarketMovementInfo = (
  contract: Contract,
  dataType?: FEED_DATA_TYPES,
  data?: Record<string, any>
) => {
  const previousProbAbout50 =
    (data?.previousProb ?? 0.5) > 0.48 && (data?.previousProb ?? 0.5) < 0.52
  const probChangeSinceAdd =
    contract.mechanism === 'cpmm-1' && data?.previousProb
      ? contract.prob - data.previousProb
      : null

  const probChange =
    contract.mechanism === 'cpmm-1' &&
    contract.createdTime < Date.now() - DAY_MS &&
    // make sure it wasn't made within the past 2 days and just moved from 50%
    !(contract.createdTime > Date.now() - 2 * DAY_MS && previousProbAbout50) &&
    Math.abs(probChangeSinceAdd ?? contract.probChanges.day) > 0.055 &&
    !contract.isResolved
      ? Math.round((probChangeSinceAdd ?? contract.probChanges.day) * 100)
      : null

  const showChange =
    probChange != null &&
    (dataType
      ? dataType === 'contract_probability_changed' ||
        dataType === 'trending_contract'
      : true)

  if (!showChange && dataType === 'contract_probability_changed') {
    // console.log('filtering prob change', probChangeSinceAdd, contract)
    return { ignore: true, probChange }
  }
  return { ignore: false, probChange }
}
