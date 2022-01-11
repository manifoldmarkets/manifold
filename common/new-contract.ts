import { calcStartPool } from './antes'

import { Contract } from './contract'
import { User } from './user'

export function getNewContract(
  id: string,
  slug: string,
  creator: User,
  question: string,
  description: string,
  initialProb: number,
  ante?: number,
  closeTime?: number
) {
  const { sharesYes, sharesNo, poolYes, poolNo, startYes, startNo } =
    calcStartPool(initialProb, ante)

  const contract: Contract = {
    id,
    slug,
    outcomeType: 'BINARY',

    creatorId: creator.id,
    creatorName: creator.name,
    creatorUsername: creator.username,

    question: question.trim(),
    description: description.trim(),

    mechanism: 'dpm-2',
    startPool: { YES: startYes, NO: startNo },
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
