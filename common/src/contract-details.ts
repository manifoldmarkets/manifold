import { BinaryContract, Contract } from './contract'
import { getFormattedMappedValue } from './pseudo-numeric'
import {
  getOutcomeProbability,
  getProbability,
  getTopAnswer,
} from './calculate'
import { richTextToString } from './util/parse'
import { getCpmmProbability } from './calculate-cpmm'
import { getDpmProbability } from './calculate-dpm'
import { formatPercent } from './util/format'

export function getBinaryProb(contract: BinaryContract) {
  const { pool, resolutionProbability, mechanism } = contract

  return (
    resolutionProbability ??
    (mechanism === 'cpmm-1'
      ? getCpmmProbability(pool, contract.p)
      : getDpmProbability(contract.totalShares))
  )
}

export const getOpenGraphProps = (
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
      ? formatPercent(getBinaryProb(contract))
      : topAnswer
      ? formatPercent(getOutcomeProbability(contract, topAnswer.id))
      : undefined

  const numericValue =
    outcomeType === 'PSEUDO_NUMERIC'
      ? getFormattedMappedValue(
          contract,
          contract.resolutionProbability ?? getProbability(contract)
        )
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
    ? `${formatPercent(getBinaryProb(contract))} chance. `
    : contract.outcomeType === 'PSEUDO_NUMERIC'
    ? `${getFormattedMappedValue(
        contract,
        contract.resolutionProbability ?? getProbability(contract)
      )} expected. `
    : ''

  return prefix + stringDesc
}
