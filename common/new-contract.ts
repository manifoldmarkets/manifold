import { range } from 'lodash'
import {
  Binary,
  Contract,
  CPMM,
  DPM,
  FreeResponse,
  Numeric,
  outcomeType,
  resolution,
  resolutionType,
} from './contract'
import { User } from './user'
import { parseTags } from './util/parse'
import { removeUndefinedProps } from './util/object'

export function getNewContract(
  id: string,
  slug: string,
  creator: User,
  question: string,
  outcomeType: outcomeType,
  description: string,
  initialProb: number,
  ante: number,
  closeTime: number,
  extraTags: string[],
  resolutionType: resolutionType,
  automaticResolution: resolution,
  automaticResolutionTime: number,

  // used for numeric markets
  bucketCount: number,
  min: number,
  max: number
) {
  const tags = parseTags(
    `${question} ${description} ${extraTags.map((tag) => `#${tag}`).join(' ')}`
  )
  const lowercaseTags = tags.map((tag) => tag.toLowerCase())

  const propsByOutcomeType =
    outcomeType === 'BINARY'
      ? getBinaryCpmmProps(initialProb, ante) // getBinaryDpmProps(initialProb, ante)
      : outcomeType === 'NUMERIC'
      ? getNumericProps(ante, bucketCount, min, max)
      : getFreeAnswerProps(ante)

  const contract: Contract = removeUndefinedProps({
    id,
    slug,
    ...propsByOutcomeType,

    creatorId: creator.id,
    creatorName: creator.name,
    creatorUsername: creator.username,
    creatorAvatarUrl: creator.avatarUrl,

    question: question.trim(),
    description: description.trim(),
    tags,
    lowercaseTags,
    visibility: 'public',
    isResolved: false,
    createdTime: Date.now(),
    closeTime,
    resolutionType,
    automaticResolution,
    automaticResolutionTime,

    volume: 0,
    volume24Hours: 0,
    volume7Days: 0,

    collectedFees: {
      creatorFee: 0,
      liquidityFee: 0,
      platformFee: 0,
    },
  })

  return contract as Contract
}

/*
import { PHANTOM_ANTE } from './antes'
import { calcDpmInitialPool } from './calculate-dpm'
const getBinaryDpmProps = (initialProb: number, ante: number) => {
  const { sharesYes, sharesNo, poolYes, poolNo, phantomYes, phantomNo } =
    calcDpmInitialPool(initialProb, ante, PHANTOM_ANTE)

  const system: DPM & Binary = {
    mechanism: 'dpm-2',
    outcomeType: 'BINARY',
    initialProbability: initialProb / 100,
    phantomShares: { YES: phantomYes, NO: phantomNo },
    pool: { YES: poolYes, NO: poolNo },
    totalShares: { YES: sharesYes, NO: sharesNo },
    totalBets: { YES: poolYes, NO: poolNo },
  }

  return system
}
*/

const getBinaryCpmmProps = (initialProb: number, ante: number) => {
  const pool = { YES: ante, NO: ante }
  const p = initialProb / 100

  const system: CPMM & Binary = {
    mechanism: 'cpmm-1',
    outcomeType: 'BINARY',
    totalLiquidity: ante,
    initialProbability: p,
    p,
    pool: pool,
  }

  return system
}

const getFreeAnswerProps = (ante: number) => {
  const system: DPM & FreeResponse = {
    mechanism: 'dpm-2',
    outcomeType: 'FREE_RESPONSE',
    pool: { '0': ante },
    totalShares: { '0': ante },
    totalBets: { '0': ante },
    answers: [],
  }

  return system
}

const getNumericProps = (
  ante: number,
  bucketCount: number,
  min: number,
  max: number
) => {
  const buckets = range(0, bucketCount).map((i) => i.toString())

  const betAnte = ante / bucketCount
  const pool = Object.fromEntries(buckets.map((answer) => [answer, betAnte]))
  const totalBets = pool

  const betShares = Math.sqrt(ante ** 2 / bucketCount)
  const totalShares = Object.fromEntries(
    buckets.map((answer) => [answer, betShares])
  )

  const system: DPM & Numeric = {
    mechanism: 'dpm-2',
    outcomeType: 'NUMERIC',
    pool,
    totalBets,
    totalShares,
    bucketCount,
    min,
    max,
  }

  return system
}
