export const liquidityTiers = [100, 1_000, 10_000, 100_000] as const
export const answerCostTiers = [25, 100, 1000, 10000] as const

export type BinaryDigit = '0' | '1'

export function getTierIndexFromLiquidity(liquidity: number): number {
  for (let tierIndex = liquidityTiers.length - 1; tierIndex >= 0; tierIndex--) {
    if (liquidity >= liquidityTiers[tierIndex]) {
      return tierIndex
    }
  }
  return 0
}

export function getAnswerCostFromLiquidity(
  liquidity: number,
  numAnswers: number
): number {
  return answerCostTiers[
    getTierIndexFromLiquidityAndAnswers(liquidity, numAnswers)
  ]
}

export function getTierIndexFromLiquidityAndAnswers(
  liquidity: number,
  numAnswers: number
): number {
  if (!numAnswers) {
    return getTierIndexFromLiquidity(liquidity)
  }
  const liquidityPerAnswer = liquidity / numAnswers
  for (
    let tierIndex = answerCostTiers.length - 1;
    tierIndex >= 0;
    tierIndex--
  ) {
    if (numAnswers > 1 && liquidityPerAnswer >= answerCostTiers[tierIndex]) {
      return tierIndex
    }
    // This handles the case of an MC answer created with 1k liquidity and only one starting answer
    // That is a 'plus' market and new answers should just cost 100.
    else if (liquidityPerAnswer > answerCostTiers[tierIndex]) {
      return tierIndex
    }
  }
  return 0
}
