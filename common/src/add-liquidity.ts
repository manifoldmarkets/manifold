import { getCpmmLiquidity } from './calculate-cpmm'
import { CPMMContract, CPMMMultiContract } from './contract'
import { LiquidityProvision } from './liquidity-provision'
import { removeUndefinedProps } from './util/object'

export const getNewLiquidityProvision = (
  userId: string,
  amount: number,
  contract: CPMMContract | CPMMMultiContract,
  newLiquidityProvisionId: string
) => {
  const { totalLiquidity, subsidyPool } = contract

  const newTotalLiquidity = (totalLiquidity ?? 0) + amount
  const newSubsidyPool = (subsidyPool ?? 0) + amount

  let pool: { [outcome: string]: number } | undefined
  let liquidity: number | undefined
  if (contract.mechanism === 'cpmm-1') {
    pool = contract.pool
    liquidity = getCpmmLiquidity(pool, contract.p)
  } else {
    liquidity = newTotalLiquidity
  }

  const newLiquidityProvision: LiquidityProvision = removeUndefinedProps({
    id: newLiquidityProvisionId,
    userId: userId,
    contractId: contract.id,
    amount,
    pool,
    liquidity,
    createdTime: Date.now(),
  })

  return { newLiquidityProvision, newTotalLiquidity, newSubsidyPool }
}
