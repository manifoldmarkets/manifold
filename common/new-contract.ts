import { calcStartPool } from "./antes";
import { Contract } from "./contract";
import { User } from "./user";

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
  const { startYes, startNo, poolYes, poolNo } = calcStartPool(
    initialProb,
    ante
  );

  const contract: Contract = {
    id,
    slug,
    outcomeType: "BINARY",

    creatorId: creator.id,
    creatorName: creator.name,
    creatorUsername: creator.username,

    question: question.trim(),
    description: description.trim(),

    startPool: { YES: startYes, NO: startNo },
    pool: { YES: poolYes, NO: poolNo },
    totalShares: { YES: 0, NO: 0 },
    totalBets: { YES: 0, NO: 0 },
    isResolved: false,

    createdTime: Date.now(),
    lastUpdatedTime: Date.now(),

    volume24Hours: 0,
    volume7Days: 0,
  };

  if (closeTime) contract.closeTime = closeTime;

  return contract;
}
