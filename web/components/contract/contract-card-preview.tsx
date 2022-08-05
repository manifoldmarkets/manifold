import { Contract } from 'common/contract'
import { getBinaryProbPercent } from 'web/lib/firebase/contracts'
import { richTextToString } from 'common/util/parse'
import { contractTextDetails } from 'web/components/contract/contract-details'
import { getFormattedMappedValue } from 'common/pseudo-numeric'
import { getProbability } from 'common/calculate'

export const getOpenGraphProps = (contract: Contract) => {
  const {
    resolution,
    question,
    creatorName,
    creatorUsername,
    outcomeType,
    creatorAvatarUrl,
    description: desc,
  } = contract
  const probPercent =
    outcomeType === 'BINARY' ? getBinaryProbPercent(contract) : undefined

  const numericValue =
    outcomeType === 'PSEUDO_NUMERIC'
      ? getFormattedMappedValue(contract)(getProbability(contract))
      : undefined

  const stringDesc = typeof desc === 'string' ? desc : richTextToString(desc)

  const description = resolution
    ? `Resolved ${resolution}. ${stringDesc}`
    : probPercent
    ? `${probPercent} chance. ${stringDesc}`
    : stringDesc

  return {
    question,
    probability: probPercent,
    metadata: contractTextDetails(contract),
    creatorName,
    creatorUsername,
    creatorAvatarUrl,
    description,
    numericValue,
  }
}
