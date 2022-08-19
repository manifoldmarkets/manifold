import { Challenge } from './challenge'
import { BinaryContract, Contract } from './contract'
import { getFormattedMappedValue } from './pseudo-numeric'
import { getProbability } from './calculate'
import { richTextToString } from './util/parse'
import { getCpmmProbability } from './calculate-cpmm'
import { getDpmProbability } from './calculate-dpm'
import { formatMoney, formatPercent } from './util/format'

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
  const { closeTime, tags } = contract
  const { createdDate, resolvedDate, volumeLabel } = contractMetrics(contract)

  const hashtags = tags.map((tag) => `#${tag}`)

  return (
    `${resolvedDate ? `${createdDate} - ${resolvedDate}` : createdDate}` +
    (closeTime
      ? ` • ${closeTime > Date.now() ? 'Closes' : 'Closed'} ${dayjs(
          closeTime
        ).format('MMM D, h:mma')}`
      : '') +
    ` • ${volumeLabel}` +
    (hashtags.length > 0 ? ` • ${hashtags.join(' ')}` : '')
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

  const probabilityParam =
    props.probability === undefined
      ? ''
      : `&probability=${encodeURIComponent(props.probability ?? '')}`

  const numericValueParam =
    props.numericValue === undefined
      ? ''
      : `&numericValue=${encodeURIComponent(props.numericValue ?? '')}`

  const creatorAvatarUrlParam =
    props.creatorAvatarUrl === undefined
      ? ''
      : `&creatorAvatarUrl=${encodeURIComponent(props.creatorAvatarUrl ?? '')}`

  const challengeUrlParams = challenge
    ? `&creatorAmount=${creatorAmount}&creatorOutcome=${creatorOutcome}` +
      `&challengerAmount=${acceptorAmount}&challengerOutcome=${acceptorOutcome}` +
      `&acceptedName=${userName ?? ''}&acceptedAvatarUrl=${userAvatarUrl ?? ''}`
    : ''

  // URL encode each of the props, then add them as query params
  return (
    `https://manifold-og-image.vercel.app/m.png` +
    `?question=${encodeURIComponent(props.question)}` +
    probabilityParam +
    numericValueParam +
    `&metadata=${encodeURIComponent(props.metadata)}` +
    `&creatorName=${encodeURIComponent(props.creatorName)}` +
    creatorAvatarUrlParam +
    `&creatorUsername=${encodeURIComponent(props.creatorUsername)}` +
    challengeUrlParams
  )
}
