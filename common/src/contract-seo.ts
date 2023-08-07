import { Contract, MultiContract } from './contract'
import { getFormattedMappedValue } from './pseudo-numeric'
import {
  getAnswerProbability,
  getDisplayProbability,
  getTopAnswer,
} from './calculate'
import { richTextToString } from './util/parse'
import { formatPercent } from './util/format'

export const getContractOGProps = (
  contract: Contract
): Omit<OgCardProps, 'points'> => {
  const {
    resolution,
    uniqueBettorCount,
    volume,
    question,
    creatorName,
    outcomeType,
    creatorAvatarUrl,
  } = contract

  const topAnswer =
    outcomeType === 'FREE_RESPONSE' || outcomeType === 'MULTIPLE_CHOICE'
      ? resolution
        ? (contract as MultiContract).answers.find((a) => a.id === resolution)
        : getTopAnswer(contract)
      : undefined

  const probPercent =
    outcomeType === 'BINARY'
      ? formatPercent(getDisplayProbability(contract))
      : topAnswer
      ? formatPercent(
          getAnswerProbability(contract as MultiContract, topAnswer.id)
        )
      : undefined

  const numericValue =
    outcomeType === 'PSEUDO_NUMERIC' || outcomeType === 'STONK'
      ? getFormattedMappedValue(contract, getDisplayProbability(contract))
      : undefined

  const bountyLeft =
    outcomeType === 'BOUNTIED_QUESTION'
      ? contract.bountyLeft.toString()
      : undefined

  return {
    question,
    numTraders: (uniqueBettorCount ?? 0).toString(),
    volume: Math.floor(volume).toString(),
    probability: probPercent,
    creatorName,
    creatorAvatarUrl,
    numericValue,
    resolution,
    topAnswer: topAnswer?.text,
    bountyLeft: bountyLeft,
  }
}

export type OgCardProps = {
  question: string
  numTraders: string // number
  volume: string // number
  probability?: string
  creatorName: string
  creatorAvatarUrl?: string
  numericValue?: string
  resolution?: string
  topAnswer?: string
  bountyLeft?: string // number
  points?: string // base64ified points
}

export function getSeoDescription(contract: Contract) {
  const { description: desc, resolution } = contract

  const stringDesc = typeof desc === 'string' ? desc : richTextToString(desc)

  const prefix = resolution
    ? `Resolved ${getResolvedValue(contract) || resolution}. `
    : contract.outcomeType === 'BINARY'
    ? `${formatPercent(getDisplayProbability(contract))} chance. `
    : contract.outcomeType === 'PSEUDO_NUMERIC'
    ? `${getFormattedMappedValue(
        contract,
        getDisplayProbability(contract)
      )} expected. `
    : ''

  return prefix + stringDesc
}

function getResolvedValue(contract: Contract) {
  if (contract.resolution === 'MKT') {
    if (
      contract.outcomeType === 'BINARY' &&
      contract.resolutionProbability != undefined
    ) {
      return formatPercent(contract.resolutionProbability)
    }
    if (
      contract.outcomeType === 'PSEUDO_NUMERIC' &&
      contract.resolutionValue != undefined
    ) {
      return contract.resolutionValue
    }
  }
  return null
}
