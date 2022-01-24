import { calcStartPool } from './antes'

import { Contract } from './contract'
import { User } from './user'
import { parseTags } from './util/parse'

export function getNewContract(
  id: string,
  slug: string,
  creator: User,
  question: string,
  description: string,
  initialProb: number,
  ante: number,
  closeTime: number
) {
  const { sharesYes, sharesNo, poolYes, poolNo, phantomYes, phantomNo } =
    calcStartPool(initialProb, ante)

  const tags = parseTags(`${question} ${description}`)
  const lowercaseTags = tags.map((tag) => tag.toLowerCase())

  const contract: Contract = {
    id,
    slug,
    outcomeType: 'BINARY',

    creatorId: creator.id,
    creatorName: creator.name,
    creatorUsername: creator.username,
    creatorAvatarUrl: creator.avatarUrl,

    question: question.trim(),
    description: description.trim(),
    tags,
    lowercaseTags,
    visibility: 'public',

    mechanism: 'dpm-2',
    phantomShares: { YES: phantomYes, NO: phantomNo },
    pool: { YES: poolYes, NO: poolNo },
    totalShares: { YES: sharesYes, NO: sharesNo },
    totalBets: { YES: poolYes, NO: poolNo },
    isResolved: false,

    createdTime: Date.now(),
    lastUpdatedTime: Date.now(),

    volume24Hours: 0,
    volume7Days: 0,
  }

  if (closeTime) contract.closeTime = closeTime

  return contract
}
