import { calcStartPool } from './antes'
import { Contract } from './contract'
import { User } from './user'
import { parseTags } from './util/parse'
import { removeUndefinedProps } from './util/object'

export function getNewContract(
  id: string,
  slug: string,
  creator: User,
  question: string,
  outcomeType: 'BINARY' | 'MULTI',
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
      ? getBinaryProps(initialProb, ante)
      : getFreeAnswerProps(ante)

  const contract: Contract<'BINARY' | 'MULTI'> = removeUndefinedProps({
    id,
    slug,
    mechanism: 'dpm-2',
    outcomeType,
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

  return contract
}

const getBinaryProps = (initialProb: number, ante: number) => {
  const { sharesYes, sharesNo, poolYes, poolNo, phantomYes, phantomNo } =
    calcStartPool(initialProb, ante)

  return {
    phantomShares: { YES: phantomYes, NO: phantomNo },
    pool: { YES: poolYes, NO: poolNo },
    totalShares: { YES: sharesYes, NO: sharesNo },
    totalBets: { YES: poolYes, NO: poolNo },
    outcomes: undefined,
  }
}

const getFreeAnswerProps = (ante: number) => {
  return {
    pool: { NONE: ante },
    totalShares: { NONE: ante },
    totalBets: { NONE: ante },
    phantomShares: undefined,
    outcomes: 'FREE_ANSWER' as const,
  }
}

const getMultiProps = (
  outcomes: string[],
  initialProbs: number[],
  ante: number
) => {
  // Not implemented.
}
