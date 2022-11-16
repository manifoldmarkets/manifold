import { Challenge } from './challenge'
import { BinaryContract, Contract } from './contract'
import { getFormattedMappedValue } from './pseudo-numeric'
import { getProbability } from './calculate'
import { richTextToString } from './util/parse'
import { getCpmmProbability } from './calculate-cpmm'
import { getDpmProbability } from './calculate-dpm'
import { formatMoney, formatPercent } from './util/format'
import { DOMAIN } from './envs/constants'

export function contractMetrics(contract: Contract) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const dayjs = require('dayjs')
  const { createdTime, resolutionTime, isResolved } = contract

  const createdDate = dayjs(createdTime).format('MMM D')

  const resolvedDate = isResolved
    ? dayjs(resolutionTime).format('MMM D')
    : undefined

  const volumeLabel = `${formatMoney(contract.volume)} bet`

  return { volumeLabel, createdDate, resolvedDate }
}

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
    outcomeType === 'BINARY'
      ? formatPercent(getBinaryProb(contract))
      : undefined

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
    resolution,
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
}

export function buildCardUrl(props: OgCardProps, challenge?: Challenge) {
  const {
    creatorAmount,
    acceptances,
    acceptorAmount,
    creatorOutcome,
    acceptorOutcome,
  } = challenge || {}
  const {
    probability,
    numericValue,
    resolution,
    creatorAvatarUrl,
    question,
    metadata,
    creatorUsername,
    creatorName,
  } = props
  const { userName, userAvatarUrl } = acceptances?.[0] ?? {}

  const probabilityParam =
    probability === undefined
      ? ''
      : `&probability=${encodeURIComponent(probability ?? '')}`

  const numericValueParam =
    numericValue === undefined
      ? ''
      : `&numericValue=${encodeURIComponent(numericValue ?? '')}`

  const creatorAvatarUrlParam =
    creatorAvatarUrl === undefined
      ? ''
      : `&creatorAvatarUrl=${encodeURIComponent(creatorAvatarUrl ?? '')}`

  const challengeUrlParams = challenge
    ? `&creatorAmount=${creatorAmount}&creatorOutcome=${creatorOutcome}` +
      `&challengerAmount=${acceptorAmount}&challengerOutcome=${acceptorOutcome}` +
      `&acceptedName=${userName ?? ''}&acceptedAvatarUrl=${userAvatarUrl ?? ''}`
    : ''

  const resolutionUrlParam = resolution
    ? `&resolution=${encodeURIComponent(resolution)}`
    : ''

  // URL encode each of the props, then add them as query params
  return (
    // NOTE: Change from DOMAIN to localhost:3000 when testing opengraph locally
    `https://${DOMAIN}/api/og/market` +
    `?question=${encodeURIComponent(question)}` +
    probabilityParam +
    numericValueParam +
    `&metadata=${encodeURIComponent(metadata)}` +
    `&creatorName=${encodeURIComponent(creatorName)}` +
    creatorAvatarUrlParam +
    `&creatorUsername=${encodeURIComponent(creatorUsername)}` +
    challengeUrlParams +
    resolutionUrlParam
  )
}
