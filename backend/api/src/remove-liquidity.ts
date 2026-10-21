import {
  getLiquidityProvidersNetTotal,
  getLiquidityWithdrawalShares,
  removeCpmmLiquidity,
} from 'common/calculate-cpmm'
import { formatMoneyWithDecimals } from 'common/util/format'
import { runTransactionWithRetries } from 'shared/transact-with-retries'
import { updateContract } from 'shared/supabase/contracts'
import { FieldVal } from 'shared/supabase/utils'
import { runTxnInBetQueue } from 'shared/txn/run-txn'
import { getContract, getUser, log } from 'shared/utils'
import { APIError, type APIHandler } from './helpers/endpoint'
import { onlyUsersWhoCanPerformAction } from './helpers/rate-limit'
import { getNewLiquidityProvision } from 'common/add-liquidity'
import { convertLiquidity } from 'common/supabase/liquidity'
import { LiquidityProvision } from 'common/liquidity-provision'
import { insertLiquidity } from 'shared/supabase/liquidity'
import { broadcastNewSubsidy } from 'shared/websockets/helpers'
import { createLiquidityReturnedNotifications } from 'shared/notifications/create-liquidity-returned-notifications'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'

export const removeLiquidity: APIHandler<'market/:contractId/remove-liquidity'> =
  onlyUsersWhoCanPerformAction(
    'removeLiquidity',
    async ({ contractId, amount: totalAmount }, auth) => {
      const user = await getUser(auth.uid)
      if (!user) throw new APIError(404, 'User not found')
      if (user.userDeleted)
        throw new APIError(403, 'Your account has been deleted')

      const result = await runTransactionWithRetries(async (pgTrans) => {
        const contract = await getContract(pgTrans, contractId)
        if (!contract) throw new APIError(404, `Contract not found`)

        if (contract.mechanism !== 'cpmm-1')
          throw new APIError(403, 'Only cpmm-1 is supported')

        // Resolution pays each liquidity provider out of pool[outcome] +
        // subsidyPool but never zeroes contract.pool, so a resolved market's
        // pool is still fully funded. Withdrawing against it here would pay the
        // providers a second time (the REMOVE_SUBSIDY txns are drawn from the
        // contract with no balance check). Re-checked inside the transaction so
        // a withdraw racing a resolution can't slip through on a stale read.
        if (contract.isResolved)
          throw new APIError(
            403,
            'Cannot remove liquidity from a resolved market'
          )
        if (contract.deleted) throw new APIError(403, 'Market is deleted')

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

        // A withdrawal goes back to every provider in proportion to their share
        // of the pool, not all to the withdrawer, who could otherwise take out
        // liquidity other people added (getLiquidityWithdrawalShares). Read in
        // this transaction, so a subsidy added meanwhile fails it to serialize
        // instead of being left out of the split.
        const liquidities = await pgTrans.map(
          `select * from contract_liquidity where contract_id = $1`,
          [contractId],
          convertLiquidity
        )
        const shares = getLiquidityWithdrawalShares(liquidities, totalAmount)
        if (!shares[auth.uid])
          throw new APIError(
            403,
            "You don't have any liquidity in this market to withdraw"
          )
        const netTotal = getLiquidityProvidersNetTotal(liquidities)
        if (totalAmount >= netTotal)
          throw new APIError(
            403,
            `Liquidity providers have put ${formatMoneyWithDecimals(
              netTotal
            )} into this market, so less than that can be withdrawn`
          )

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
        })

        const provisions: LiquidityProvision[] = []
        for (const [userId, share] of Object.entries(shares)) {
          await runTxnInBetQueue(pgTrans, {
            fromType: 'CONTRACT',
            fromId: contract.id,
            toType: 'USER',
            toId: userId,
            category: 'REMOVE_SUBSIDY',
            amount: share,
            token: contract.token === 'CASH' ? 'CASH' : 'M$',
          })

          const newLiquidityProvision = {
            ...getNewLiquidityProvision(userId, -1 * share, contract),
            ...(userId !== auth.uid ? { withdrawnBy: auth.uid } : {}),
          }

          const liquidityRow = await insertLiquidity(
            pgTrans,
            newLiquidityProvision
          )
          provisions.push(convertLiquidity(liquidityRow))
        }

        log(
          'removed subsidy of',
          formatMoneyWithDecimals(totalAmount),
          'from',
          contract.slug,
          'returned to',
          provisions.length,
          'providers'
        )

        return { contract, provisions }
      })
      const { contract, provisions } = result

      const liquidity = provisions.find((l) => l.userId === auth.uid)!
      const returned = provisions.filter((l) => l.userId !== auth.uid)

      return {
        result: liquidity,
        continue: async () => {
          broadcastNewSubsidy(contract.id, contract.visibility, -totalAmount)
          await createLiquidityReturnedNotifications(contract, user, returned)
        },
      }
    }
  )
