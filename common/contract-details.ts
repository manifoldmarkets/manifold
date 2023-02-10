import { Challenge } from './challenge'
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
import { filterDefined } from './util/array'
import { DOMAIN } from './envs/constants'

// String version of the above, to send to the OpenGraph image generator
export function contractTextDetails(contract: Contract) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const dayjs = require('dayjs')
  const { closeTime, groupLinks } = contract
  const { createdDate, resolvedDate, volumeLabel } = contractMetrics(contract)

  const groupHashtags = groupLinks?.map((g) => `#${g.name.replace(/ /g, '')}`)

  return (
    `${resolvedDate ? `${createdDate} - ${resolvedDate}` : createdDate}` +
    (closeTime
      ? ` • ${closeTime > Date.now() ? 'Closes' : 'Closed'} ${dayjs(
          closeTime
        ).format('MMM D, h:mma')}`
      : '') +
    ` • ${volumeLabel}` +
    (groupHashtags ? ` • ${groupHashtags.join(' ')}` : '')
  )
}

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
): OgCardProps & { description: string } => {
  const {
    resolution,
    question,
    creatorName,
    creatorUsername,
    outcomeType,
    creatorAvatarUrl,
    description: desc,
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
          contract.resolutionProbability
            ? contract.resolutionProbability
            : getProbability(contract)
        )
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
    resolution,
    topAnswer: topAnswer?.text,
  }
}

export type OgCardProps = {
  question: string
  probability?: string
  metadata: string
  creatorName: string
  creatorUsername: string
  creatorAvatarUrl?: string
  numericValue?: string
  resolution?: string
  topAnswer?: string
}

export function buildCardUrl(props: OgCardProps, challenge?: Challenge) {
  const {
    creatorAmount,
    acceptances,
    acceptorAmount,
    creatorOutcome,
    acceptorOutcome,
  } = challenge || {}
  const { userName, userAvatarUrl } = acceptances?.[0] ?? {}

  const ignoredKeys = ['description']
  const generateUrlParams = (params: Record<string, string | undefined>) =>
    filterDefined(
      Object.entries(params).map(([key, value]) =>
        !ignoredKeys.includes(key) && value
          ? `${key}=${encodeURIComponent(value)}`
          : null
      )
    ).join('&')

  const challengeUrlParams = challenge
    ? `&creatorAmount=${creatorAmount}&creatorOutcome=${creatorOutcome}` +
      `&challengerAmount=${acceptorAmount}&challengerOutcome=${acceptorOutcome}` +
      `&acceptedName=${userName ?? ''}&acceptedAvatarUrl=${userAvatarUrl ?? ''}`
    : ''

  // Change to localhost:3000 for local testing
  const url =
    // `http://localhost:3000/api/og/market?` +
    `https://${DOMAIN}/api/og/market?` +
    generateUrlParams(props) +
    challengeUrlParams

  return url
}
