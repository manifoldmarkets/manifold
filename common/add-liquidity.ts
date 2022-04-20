import { addCpmmLiquidity, getCpmmLiquidity } from './calculate-cpmm'
import { Binary, CPMM, FullContract } from './contract'
import { LiquidityProvision } from './liquidity-provision'
import { User } from './user'

export const getNewLiquidityProvision = (
  user: User,
  amount: number,
  contract: FullContract<CPMM, Binary>,
  newLiquidityProvisionId: string
) => {
  const { pool, p, totalLiquidity } = contract

  const { newPool, newP } = addCpmmLiquidity(pool, p, amount)

  const liquidity =
    getCpmmLiquidity(newPool, newP) - getCpmmLiquidity(pool, newP)

  const newLiquidityProvision: LiquidityProvision = {
    id: newLiquidityProvisionId,
    userId: user.id,
    contractId: contract.id,
    amount,
    pool: newPool,
    p: newP,
    liquidity,
    createdTime: Date.now(),
  }

  const newTotalLiquidity = (totalLiquidity ?? 0) + amount

  const newBalance = user.balance - amount

  return { newLiquidityProvision, newPool, newP, newBalance, newTotalLiquidity }
}
