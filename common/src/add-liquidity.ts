import {
  CPMMContract,
  CPMMMultiContract,
  CPMMNumericContract,
  Contract,
} from './contract'
import { LiquidityProvision } from './liquidity-provision'
import { removeUndefinedProps } from './util/object'

export const getNewLiquidityProvision = (
  userId: string,
  amount: number,
  contract: CPMMContract | CPMMMultiContract | CPMMNumericContract |Contract,
  newLiquidityProvisionId: string,
  answerId?: string
) => {
  let totalLiquidity = 0
  let subsidyPool = 0

  if ('totalLiquidity' in contract && 'subsidyPool' in contract) {
    totalLiquidity = contract.totalLiquidity
    subsidyPool = contract.subsidyPool
  }

  const newTotalLiquidity = (totalLiquidity ?? 0) + amount
  // If answerId is defined, amount will be added to the answer's subsidy pool
  const newSubsidyPool = (subsidyPool ?? 0) + (answerId ? 0 : amount)

  let pool: { [outcome: string]: number } | undefined
  if (contract.mechanism === 'cpmm-1') {
    pool = contract.pool
  }

  const newLiquidityProvision: Omit<LiquidityProvision, 'id'> =
    removeUndefinedProps({
      userId: userId,
      contractId: contract.id,
      answerId,
      amount,
      pool,
      createdTime: Date.now(),
    })

  return newLiquidityProvision
}
