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
import { convertsToCpmmMulti2, isMultiCpmm } from 'common/contract'
import { FieldVal } from 'shared/supabase/utils'
import { updateContract } from 'shared/supabase/contracts'
import { getAnswer } from 'shared/supabase/answers'
import { broadcastUpdatedAnswers } from 'shared/websockets/helpers'
import { convertAnswer } from 'common/supabase/contracts'
import { Row } from 'common/supabase/utils'
import { Answer } from 'common/answer'

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
    // Only markets of neither kind reach this, so the message needn't name cpmm-multi-2.
    if (contract.mechanism !== 'cpmm-1' && !isMultiCpmm(contract))
      throw new APIError(403, 'Only cpmm-1 and cpmm-multi-1 are supported')

    // Per-answer subsidy: only meaningful for multi-choice CPMM (each answer is its own binary
    // pool). Validate the answer belongs to this contract before we move any mana.
    if (answerId !== undefined) {
      if (!isMultiCpmm(contract))
        throw new APIError(
          403,
          'answerId is only supported for multiple-choice CPMM markets'
        )
      // A cpmm-multi-2 answer takes the subsidy losslessly by floating its own p.
      // A cpmm-multi-1 answer is pinned at p = 0.5, so the drizzle would throw
      // most of a subsidy away on an answer far from 50% (80% of its value at
      // 10%). Only allow it where it's lossless: cpmm-multi-2 markets, or ones
      // this add converts to cpmm-multi-2.
      if (
        contract.mechanism !== 'cpmm-multi-2' &&
        !convertsToCpmmMulti2(contract)
      )
        throw new APIError(
          403,
          "Liquidity can't be added to a single answer on this market: it was created before multiple choice markets supported it."
        )
      const answer = await getAnswer(tx, answerId)
      if (!answer || answer.contractId !== contractId)
        throw new APIError(404, 'Answer not found on this contract')
      // A resolved answer has paid out its pools and subsidy, and never pays
      // out again, so a subsidy added to it would be lost.
      if (answer.resolution)
        throw new APIError(403, 'This answer is already resolved')
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
    // that switches reads/bets/drizzle to the v2 (lossless + reversible-fill) path. Gated behind its
    // own kill switch, separate from v2 creation, so it stays inert until deliberately enabled.
    const shouldConvertToV2 = convertsToCpmmMulti2(contract)

    // A resolution that committed after this transaction read the market has
    // already paid out its pools and pending subsidy, and would strand this
    // subsidy. Each branch below updates the market's row first, so this read
    // is current: a resolution that has committed shows here, and one still
    // to come has to wait for this transaction, then fails to serialize
    // rather than pay out without it. Resolving the whole market leaves each
    // answer's resolution unset, so the answer's own guard below can't see it.
    const refuseIfResolved = async () => {
      const { resolved } = await tx.one<{ resolved: boolean }>(
        `select (resolution is not null or resolution_time is not null) as resolved
        from contracts where id = $1`,
        [contractId]
      )
      if (resolved) throw new APIError(403, 'This market has already resolved')
    }

    let updatedAnswer: Answer | undefined
    if (answerId !== undefined) {
      // contract-level totalLiquidity still tracks the whole market's subsidy; the conversion
      // trigger applies just as for a whole-market add. Update the contract row before the
      // answer row, the order bets lock them in, so the two can't deadlock.
      await updateContract(tx, contractId, {
        totalLiquidity: FieldVal.increment(subsidyAmount),
        ...(shouldConvertToV2 ? { mechanism: 'cpmm-multi-2' as const } : {}),
      })
      await refuseIfResolved()
      // Per-answer: the subsidy lands in THAT answer's subsidyPool (drizzleAnswer deepens it
      // losslessly), and in its totalLiquidity, as addHouseSubsidyToAnswer does. An atomic
      // increment, so it can't interleave with the scheduler's drizzleAnswer, which
      // read-modify-writes subsidyPool under a row lock in another process. The resolution
      // check here also covers an answer resolved on its own since the check above.
      const updated = await tx.oneOrNone<Row<'answers'>>(
        `update answers
        set
          total_liquidity = total_liquidity + $1,
          subsidy_pool = subsidy_pool + $1
        where id = $2 and resolution is null
        returning *`,
        [subsidyAmount, answerId]
      )
      if (!updated) throw new APIError(403, 'This answer is already resolved')
      updatedAnswer = convertAnswer(updated)
    } else {
      await updateContract(tx, contractId, {
        subsidyPool: FieldVal.increment(subsidyAmount),
        totalLiquidity: FieldVal.increment(subsidyAmount),
        ...(shouldConvertToV2 ? { mechanism: 'cpmm-multi-2' as const } : {}),
      })
      await refuseIfResolved()
    }

    return {
      result: liquidity,
      continue: async () => {
        // The increment above skips updateAnswer, and with it the broadcast,
        // so send the answer's new pending subsidy here, once it's committed.
        // Without it, open pages count the subsidy as active until a reload.
        if (updatedAnswer) broadcastUpdatedAnswers(contractId, [updatedAnswer])
        await onCreateLiquidityProvision(liquidity)
      },
    }
  })
}
