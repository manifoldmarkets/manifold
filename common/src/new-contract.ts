import { range } from 'lodash'
import {
  Binary,
  Cert,
  Contract,
  CPMM,
  DPM,
  FreeResponse,
  MultipleChoice,
  Numeric,
  outcomeType,
  PseudoNumeric,
  QuadraticFunding,
  Stonk,
  Uniswap2,
  visibility,
} from './contract'
import { User } from './user'
import { removeUndefinedProps } from './util/object'
import { JSONContent } from '@tiptap/core'
import { computeBinaryCpmmElasticityFromAnte } from './calculate-metrics'

export function getNewContract(
  id: string,
  slug: string,
  creator: User,
  question: string,
  outcomeType: outcomeType,
  description: JSONContent,
  initialProb: number,
  ante: number,
  closeTime: number,

  // used for numeric markets
  bucketCount: number,
  min: number,
  max: number,
  isLogScale: boolean,

  // for multiple choice
  answers: string[],
  visibility: visibility,

  // twitch
  isTwitchContract: boolean | undefined
) {
  const createdTime = Date.now()

  const propsByOutcomeType = {
    BINARY: () => getBinaryCpmmProps(initialProb, ante),
    PSEUDO_NUMERIC: () =>
      getPseudoNumericCpmmProps(initialProb, ante, min, max, isLogScale),
    NUMERIC: () => getNumericProps(ante, bucketCount, min, max),
    MULTIPLE_CHOICE: () => getDpmMultipleChoiceProps(ante, answers),
    QUADRATIC_FUNDING: () => getQfProps(ante),
    CERT: () => getCertProps(ante),
    FREE_RESPONSE: () => getFreeAnswerProps(ante),
    STONK: () => getStonkCpmmProps(initialProb, ante),
  }[outcomeType]()

  const contract: Contract = removeUndefinedProps({
    id,
    slug,
    ...propsByOutcomeType,

    creatorId: creator.id,
    creatorName: creator.name,
    creatorUsername: creator.username,
    creatorAvatarUrl: creator.avatarUrl,
    creatorCreatedTime: creator.createdTime,

    question: question.trim(),
    description,
    visibility,
    unlistedById: visibility === 'unlisted' ? creator.id : undefined,
    isResolved: false,
    createdTime,
    closeTime,
    dailyScore: 0,
    popularityScore: 0,
    uniqueBettorCount: 0,
    lastUpdatedTime: createdTime,

    volume: 0,
    volume24Hours: 0,
    elasticity:
      propsByOutcomeType.mechanism === 'cpmm-1'
        ? computeBinaryCpmmElasticityFromAnte(ante)
        : 4.99,

    collectedFees: {
      creatorFee: 0,
      liquidityFee: 0,
      platformFee: 0,
    },

    isTwitchContract,
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
    subsidyPool: 0,
    initialProbability: p,
    p,
    pool: pool,
    prob: initialProb,
    probChanges: { day: 0, week: 0, month: 0 },
  }

  return system
}

const getPseudoNumericCpmmProps = (
  initialProb: number,
  ante: number,
  min: number,
  max: number,
  isLogScale: boolean
) => {
  const system: CPMM & PseudoNumeric = {
    ...getBinaryCpmmProps(initialProb, ante),
    outcomeType: 'PSEUDO_NUMERIC',
    min,
    max,
    isLogScale,
  }

  return system
}
const getStonkCpmmProps = (initialProb: number, ante: number) => {
  const system: CPMM & Stonk = {
    ...getBinaryCpmmProps(initialProb, ante),
    outcomeType: 'STONK',
  }
  return system
}

const getCertProps = (ante: number) => {
  const system: Uniswap2 & Cert = {
    mechanism: 'uniswap-2',
    outcomeType: 'CERT',
    pool: {
      SHARE: ante,
      M$: ante,
    },
    // TODO: Update price in the cert when trades happen
    price: 1,
  }
  return system
}

const getQfProps = (ante: number) => {
  const system: QuadraticFunding = {
    outcomeType: 'QUADRATIC_FUNDING',
    mechanism: 'qf',
    answers: [],
    pool: { M$: ante },
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

const getDpmMultipleChoiceProps = (ante: number, answers: string[]) => {
  const numAnswers = answers.length
  const betAnte = ante / numAnswers
  const betShares = Math.sqrt(ante ** 2 / numAnswers)

  const defaultValues = (x: any) =>
    Object.fromEntries(range(0, numAnswers).map((k) => [k, x]))

  const system: DPM & MultipleChoice = {
    mechanism: 'dpm-2',
    outcomeType: 'MULTIPLE_CHOICE',
    pool: defaultValues(betAnte),
    totalShares: defaultValues(betShares),
    totalBets: defaultValues(betAnte),
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
