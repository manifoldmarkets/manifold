import { addCpmmLiquidity } from 'common/calculate-cpmm'
import { getTierFromLiquidity } from 'common/tier'
import { formatMoneyWithDecimals } from 'common/util/format'
import { runShortTrans } from 'shared/short-transaction'
import { updateContract } from 'shared/supabase/contracts'
import { FieldVal } from 'shared/supabase/utils'
import { runTxn } from 'shared/txn/run-txn'
import { getContract, getUser, log } from 'shared/utils'
import { APIError, type APIHandler } from './helpers/endpoint'
import { getNewLiquidityProvision } from 'common/add-liquidity'
import { convertLiquidity } from 'common/supabase/liquidity'
import { insertLiquidity } from 'shared/supabase/liquidity'
import { onCreateLiquidityProvision } from './on-update-liquidity-provision'

const UNBALANCED_POOL_RATIO_LIMIT = 9
const MINIMUM_LIQUIDITY = 100

export const removeLiquidity: APIHandler<
  'market/:contractId/remove-liquidity'
> = async ({ contractId, amount: totalAmount }, auth) => {
  const liquidity = await runShortTrans(async (pgTrans) => {
    const contract = await getContract(pgTrans, contractId)
    if (!contract) throw new APIError(404, `Contract not found`)

    if (contract.mechanism !== 'cpmm-1')
      throw new APIError(403, 'Only cpmm-1 is supported')

    const user = await getUser(auth.uid, pgTrans)

    if (!user) throw new APIError(401, 'Your account was not found')

    if (auth.uid !== contract.creatorId)
      throw new APIError(403, 'You are not the creator of this market')

    const { subsidyPool: pendingLiquidity } = contract

    const takeFromPending = Math.min(pendingLiquidity, totalAmount)
    const takeFromPool = totalAmount - takeFromPending
    const newTotal = contract.totalLiquidity - totalAmount

    if (newTotal < MINIMUM_LIQUIDITY) {
      throw new APIError(
        403,
        `Must leave at least ${MINIMUM_LIQUIDITY} liquidity in the market.`
      )
    }

    if (takeFromPool > 0) {
      const { newPool, newP } = addCpmmLiquidity(
        contract.pool,
        contract.p,
        -1 * takeFromPool
      )

      // this should never happen for positive MIN_LIQUIDITY but just in case
      if (newPool.YES <= 0 || newPool.NO <= 0)
        throw new APIError(500, 'Cannot remove all liquidity')

      if (
        newPool.YES > UNBALANCED_POOL_RATIO_LIMIT * newPool.NO ||
        newPool.NO > UNBALANCED_POOL_RATIO_LIMIT * newPool.YES
      ) {
        throw new APIError(
          403,
          `Removing that much liquidity would result in ${newPool.YES} YES vs ${newPool.NO} NO which is beyond the ratio of ${UNBALANCED_POOL_RATIO_LIMIT} to 1.`
        )
      }

      await updateContract(pgTrans, contractId, {
        pool: newPool,
        p: newP,
      })
    }

    await updateContract(pgTrans, contractId, {
      subsidyPool: FieldVal.increment(-takeFromPending),
      totalLiquidity: FieldVal.increment(-totalAmount),
      marketTier: getTierFromLiquidity(
        contract,
        contract.totalLiquidity - totalAmount
      ),
    })

    await runTxn(pgTrans, {
      fromType: 'CONTRACT',
      fromId: contract.id,
      toType: 'USER',
      toId: auth.uid,
      category: 'REMOVE_SUBSIDY',
      amount: totalAmount,
      token: contract.token === 'CASH' ? 'CASH' : 'M$',
    })

    const newLiquidityProvision = getNewLiquidityProvision(
      auth.uid,
      -1 * totalAmount,
      contract
    )

    const liquidityRow = await insertLiquidity(pgTrans, newLiquidityProvision)
    const liqudity = convertLiquidity(liquidityRow)

    log(
      'removed subsidy of',
      formatMoneyWithDecimals(totalAmount),
      'from',
      contract.slug
    )

    return liqudity
  })

  return {
    result: liquidity,
    continue: () => onCreateLiquidityProvision(liquidity),
  }
}
