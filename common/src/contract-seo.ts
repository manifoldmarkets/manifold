import { Contract } from './contract'
import { getFormattedMappedValue } from './pseudo-numeric'
import {
  getDisplayProbability,
  getOutcomeProbability,
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
        ? contract.answers.find((a) => a.id === resolution)
        : getTopAnswer(contract)
      : undefined

  const probPercent =
    outcomeType === 'BINARY'
      ? formatPercent(getDisplayProbability(contract))
      : topAnswer
      ? formatPercent(getOutcomeProbability(contract, topAnswer.id))
      : undefined

  const numericValue =
    outcomeType === 'PSEUDO_NUMERIC' || outcomeType === 'STONK'
      ? getFormattedMappedValue(contract, getDisplayProbability(contract))
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
  points?: string // base64ified points
}

export function getSeoDescription(contract: Contract) {
  const { description: desc, resolution } = contract

  const stringDesc = typeof desc === 'string' ? desc : richTextToString(desc)

  const prefix = resolution
    ? `Resolved ${resolution}. `
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
