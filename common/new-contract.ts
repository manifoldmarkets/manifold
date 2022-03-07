import { PHANTOM_ANTE } from './antes'
import {
  Binary,
  Contract,
  CPMM,
  DPM,
  FreeResponse,
  outcomeType,
} from './contract'
import { User } from './user'
import { parseTags } from './util/parse'
import { removeUndefinedProps } from './util/object'
import { calcCpmmInitialPool } from './calculate-cpmm'
import { calcDpmInitialPool } from './calculate-dpm'

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
  extraTags: string[]
) {
  const tags = parseTags(
    `${question} ${description} ${extraTags.map((tag) => `#${tag}`).join(' ')}`
  )
  const lowercaseTags = tags.map((tag) => tag.toLowerCase())

  const propsByOutcomeType =
    outcomeType === 'BINARY'
      ? getBinaryCpmmProps(initialProb, ante, creator.id) // getBinaryDpmProps(initialProb, ante)
      : getFreeAnswerProps(ante)

  const contract = removeUndefinedProps({
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
    lastUpdatedTime: Date.now(),
    closeTime,

    volume24Hours: 0,
    volume7Days: 0,
  })

  return contract as Contract
}

const getBinaryDpmProps = (initialProb: number, ante: number) => {
  const { sharesYes, sharesNo, poolYes, poolNo, phantomYes, phantomNo } =
    calcDpmInitialPool(initialProb, ante, PHANTOM_ANTE)

  const system: DPM & Binary = {
    mechanism: 'dpm-2',
    outcomeType: 'BINARY',
    phantomShares: { YES: phantomYes, NO: phantomNo },
    pool: { YES: poolYes, NO: poolNo },
    totalShares: { YES: sharesYes, NO: sharesNo },
    totalBets: { YES: poolYes, NO: poolNo },
  }

  return system
}

const getBinaryCpmmProps = (
  initialProb: number,
  ante: number,
  userId: string
) => {
  const { poolYes, poolNo } = calcCpmmInitialPool(initialProb, ante)
  const pool = { YES: poolYes, NO: poolNo }

  const system: CPMM & Binary = {
    mechanism: 'cpmm-1',
    outcomeType: 'BINARY',
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

const getMultiProps = (
  outcomes: string[],
  initialProbs: number[],
  ante: number
) => {
  // Not implemented.
}
