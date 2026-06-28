import { getNewLiquidityProvision } from 'common/add-liquidity'
import { APIError, type APIHandler } from './helpers/endpoint'
import { onlyUsersWhoCanPerformAction } from './helpers/rate-limit'
import { SUBSIDY_FEE } from 'common/economy'
import { runTxnInBetQueue } from 'shared/txn/run-txn'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getContract, getUser } from 'shared/utils'
import { onCreateLiquidityProvision } from './on-update-liquidity-provision'
import { insertLiquidity } from 'shared/supabase/liquidity'
import { convertLiquidity } from 'common/supabase/liquidity'
import { CPMM_MULTI_2_CREATION_ENABLED, isMultiCpmm } from 'common/contract'
import { FieldVal } from 'shared/supabase/utils'
import { updateContract } from 'shared/supabase/contracts'
import { getAnswer, updateAnswer } from 'shared/supabase/answers'

export const addLiquidity: APIHandler<'market/:contractId/add-liquidity'> =
  onlyUsersWhoCanPerformAction(
    'addLiquidity',
    async ({ contractId, amount, answerId }, auth) => {
      return addContractLiquidity(contractId, amount, auth.uid, answerId)
    }
  )

export const addContractLiquidity = async (
  contractId: string,
  amount: number,
  userId: string,
  // When set, subsidize a single answer (its own binary CPMM) rather than the whole market.
  answerId?: string
) => {
  // Run as transaction to prevent race conditions
  return await createSupabaseDirectClient().tx(async (tx) => {
    const contract = await getContract(tx, contractId)
    if (!contract) throw new APIError(404, 'Contract not found')

    // Block adding liquidity when trading for the relevant token is disabled site-wide
    const systemStatus = await tx.oneOrNone(
      `select status from system_trading_status where token = $1`,
      [contract.token]
    )
    if (!systemStatus?.status) {
      throw new APIError(
        403,
        `Trading with ${contract.token} is currently disabled.`
      )
    }

    // isMultiCpmm covers both cpmm-multi-1 and cpmm-multi-2; the subsidy lands in
    // subsidyPool + an LP-provision row, and the drizzle job injects it into the
    // pools (losslessly via the V2 float-p add for cpmm-multi-2; see 2b.6).
    if (contract.mechanism !== 'cpmm-1' && !isMultiCpmm(contract))
      throw new APIError(
        403,
        'Only cpmm-1 and multiple-choice CPMM markets are supported'
      )

    // Per-answer subsidy: only meaningful for multi-choice CPMM (each answer is its own binary
    // pool). Validate the answer belongs to this contract before we move any mana.
    if (answerId !== undefined) {
      if (!isMultiCpmm(contract))
        throw new APIError(
          403,
          'answerId is only supported for multiple-choice CPMM markets'
        )
      const answer = await getAnswer(tx, answerId)
      if (!answer || answer.contractId !== contractId)
        throw new APIError(404, 'Answer not found on this contract')
    }

    const { closeTime } = contract
    if (closeTime && Date.now() > closeTime)
      throw new APIError(403, 'Trading is closed')

    if (!isFinite(amount)) throw new APIError(400, 'Invalid amount')

    const user = await getUser(userId, tx)
    if (!user) throw new APIError(401, 'Your account was not found')
    if (user.userDeleted)
      throw new APIError(403, 'Your account has been deleted')

    if (user.balance < amount) throw new APIError(403, 'Insufficient balance')

    await runTxnInBetQueue(tx, {
      fromId: userId,
      amount: amount,
      toId: contractId,
      toType: 'CONTRACT',
      category: 'ADD_SUBSIDY',
      token: contract.token === 'CASH' ? 'CASH' : 'M$',
      fromType: 'USER',
    })

    const subsidyAmount = (1 - SUBSIDY_FEE) * amount

    const newLiquidityProvision = getNewLiquidityProvision(
      userId,
      subsidyAmount,
      contract,
      answerId
    )

    const liquidityRow = await insertLiquidity(tx, newLiquidityProvision)
    const liquidity = convertLiquidity(liquidityRow)

    // Lazy v1 -> v2 conversion: an explicit user addLiquidity is THE conversion trigger for a
    // cpmm-multi-1 market (the scheduler drizzle never converts — it must not flip fill semantics
    // under resting orders; see migration policy). Conversion is lossless in state: a cpmm-multi-1
    // market IS a cpmm-multi-2 market with every answer p = 0.5, so flipping the mechanism string is
    // the whole migration. p is nullable-defaulting-0.5 on read, and the first v2 drizzle deepen
    // persists each answer's concrete floated p. The mechanism flip is the API-visible version event
    // that switches reads/bets/drizzle to the v2 (lossless + reversible-fill) path. Gated behind the
    // same staged-rollout kill-switch as v2 creation, so it stays inert until deliberately enabled.
    const shouldConvertToV2 =
      CPMM_MULTI_2_CREATION_ENABLED && contract.mechanism === 'cpmm-multi-1'

    if (answerId !== undefined) {
      // Per-answer: the subsidy lands in THAT answer's subsidyPool (drizzleAnswer deepens it
      // losslessly). updateAnswer takes a concrete value, so read-then-add within this tx.
      const answer = await getAnswer(tx, answerId)
      await updateAnswer(tx, answerId, {
        subsidyPool: (answer?.subsidyPool ?? 0) + subsidyAmount,
      })
      // contract-level totalLiquidity still tracks the whole market's subsidy; the conversion
      // trigger applies just as for a whole-market add.
      await updateContract(tx, contractId, {
        totalLiquidity: FieldVal.increment(subsidyAmount),
        ...(shouldConvertToV2 ? { mechanism: 'cpmm-multi-2' as const } : {}),
      })
    } else {
      await updateContract(tx, contractId, {
        subsidyPool: FieldVal.increment(subsidyAmount),
        totalLiquidity: FieldVal.increment(subsidyAmount),
        ...(shouldConvertToV2 ? { mechanism: 'cpmm-multi-2' as const } : {}),
      })
    }

    return {
      result: liquidity,
      continue: () => onCreateLiquidityProvision(liquidity),
    }
  })
}
