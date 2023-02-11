import { getCpmmLiquidity } from './calculate-cpmm'
import { CPMMContract } from './contract'
import { LiquidityProvision } from './liquidity-provision'

export const getNewLiquidityProvision = (
  userId: string,
  amount: number,
  contract: CPMMContract,
  newLiquidityProvisionId: string
) => {
  const { pool, p, totalLiquidity, subsidyPool } = contract

  const liquidity = getCpmmLiquidity(pool, p)

  const newLiquidityProvision: LiquidityProvision = {
    id: newLiquidityProvisionId,
    userId: userId,
    contractId: contract.id,
    amount,
    pool,
    liquidity,
    createdTime: Date.now(),
  }

  const newTotalLiquidity = (totalLiquidity ?? 0) + amount
  const newSubsidyPool = (subsidyPool ?? 0) + amount

  return { newLiquidityProvision, newTotalLiquidity, newSubsidyPool }
}
