import { removeCpmmLiquidity } from 'common/calculate-cpmm'
import { getTierFromLiquidity } from 'common/tier'
import { formatMoneyWithDecimals } from 'common/util/format'
import { runTransactionWithRetries } from 'shared/transact-with-retries'
import { updateContract } from 'shared/supabase/contracts'
import { FieldVal } from 'shared/supabase/utils'
import { runTxnInBetQueue } from 'shared/txn/run-txn'
import { getContract, log } from 'shared/utils'
import { APIError, type APIHandler } from './helpers/endpoint'
import { getNewLiquidityProvision } from 'common/add-liquidity'
import { convertLiquidity } from 'common/supabase/liquidity'
import { insertLiquidity } from 'shared/supabase/liquidity'
import { onCreateLiquidityProvision } from './on-update-liquidity-provision'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'

export const removeLiquidity: APIHandler<
  'market/:contractId/remove-liquidity'
> = async ({ contractId, amount: totalAmount }, auth) => {
  const liquidity = await runTransactionWithRetries(async (pgTrans) => {
    const contract = await getContract(pgTrans, contractId)
    if (!contract) throw new APIError(404, `Contract not found`)

    if (contract.mechanism !== 'cpmm-1')
      throw new APIError(403, 'Only cpmm-1 is supported')

    // TODO: this should be based on liquidity providers instead ...
    if (contract.token === 'CASH') {
      if (
        auth.uid !== HOUSE_LIQUIDITY_PROVIDER_ID &&
        auth.uid !== DEV_HOUSE_LIQUIDITY_PROVIDER_ID
      ) {
        throw new APIError(
          403,
          'Only Manifold account is allowed to remove sweepcash liquidity. Complain to Sinclair'
        )
      }
    } else {
      if (auth.uid !== contract.creatorId)
        throw new APIError(403, 'You are not the creator of this market')
    }

    const { subsidyPool: pendingLiquidity } = contract

    const takeFromPending = Math.min(pendingLiquidity, totalAmount)
    const takeFromPool = totalAmount - takeFromPending

    if (takeFromPool > 0) {
      const { newPool, newP, error } = removeCpmmLiquidity(
        contract.pool,
        contract.p,
        takeFromPool
      )

      if (error) {
        throw new APIError(403, `Remaining liquidity too low`)
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

    await runTxnInBetQueue(pgTrans, {
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
