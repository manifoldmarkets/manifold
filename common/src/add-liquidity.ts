import {
  CPMMContract,
  CPMMMultiContract,
  CPMMNumericContract,
} from './contract'

export const getNewLiquidityProvision = (
  amount: number,
  contract: CPMMContract | CPMMMultiContract | CPMMNumericContract,
  answerId?: string
) => {
  const { totalLiquidity, subsidyPool } = contract

  const newTotalLiquidity = (totalLiquidity ?? 0) + amount
  // If answerId is defined, amount will be added to the answer's subsidy pool
  const newSubsidyPool = (subsidyPool ?? 0) + (answerId ? 0 : amount)

  return { newTotalLiquidity, newSubsidyPool }
}
