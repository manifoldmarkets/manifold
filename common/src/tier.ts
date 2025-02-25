export const liquidityTiers = [100, 1_000, 10_000, 100_000] as const
export const answerCostTiers = [25, 100, 1000, 10000] as const

export type BinaryDigit = '0' | '1'

export function getTierFromLiquidity(liquidity: number): number {
  return liquidityTiers.findIndex((tier) => tier >= liquidity)
}

export function getAnswerCostFromLiquidity(
  liquidity: number,
  numAnswers: number
): number {
  return answerCostTiers[
    liquidityTiers.findIndex((tier) => tier >= liquidity / numAnswers)
  ]
}

export function getTierFromLiquidityAndAnswers(
  liquidity: number,
  numAnswers: number
): number {
  return liquidityTiers.findIndex((tier) => tier >= liquidity / numAnswers)
}
