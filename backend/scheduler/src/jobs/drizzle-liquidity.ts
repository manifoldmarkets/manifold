import { CPMMContract, CPMMMultiContract, isMultiCpmm } from 'common/contract'
import { mapAsync } from 'common/util/promise'
import { APIError } from 'common/api/utils'
import {
  addCpmmLiquidity,
  addCpmmLiquidityFixedP,
  addCpmmMultiLiquidityAnswersSumToOne,
  addCpmmMultiLiquidityAnswersSumToOneV2,
  canDeployCpmmMulti2Liquidity,
  addCpmmMultiLiquidityToAnswersIndependently,
  addCpmmMultiLiquidityToAnswersIndependentlyV2,
  getCpmmProbability,
  isDeepenableProb,
} from 'common/calculate-cpmm'
import { Answer } from 'common/answer'
import { formatMoneyWithDecimals } from 'common/util/format'
import { shuffle } from 'lodash'
import {
  SupabaseDirectClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { convertAnswer } from 'common/supabase/contracts'
import {
  getAnswerForUpdate,
  updateAnswer,
  updateAnswers,
} from 'shared/supabase/answers'
import { runTransactionWithRetries } from 'shared/transact-with-retries'
import { getContract, log } from 'shared/utils'
import { updateContract } from 'shared/supabase/contracts'
import { broadcastUpdatedAnswers } from 'shared/websockets/helpers'

// (GPnn labels cite machine-checked proofs: https://github.com/evand/manifold-math/tree/main/cpmm-multi-2/proofs)

export const drizzleLiquidity = async () => {
  const pg = createSupabaseDirectClient()

  const data = await pg.manyOrNone<{ id: string }>(
    `select id from contracts where (data->'subsidyPool')::numeric > 1e-7`
  )
  const contractIds = shuffle(data.map((doc) => doc.id))
  log('found', contractIds.length, 'markets to drizzle')

  // One market that can't be drizzled (a pool the add rejects, a deleted
  // contract) is logged and skipped, so it stops neither the rest nor the
  // per-answer phase below.
  await mapAsync(
    contractIds,
    async (cid) => {
      try {
        await drizzleMarket(cid)
      } catch (e) {
        log.error(`drizzleMarket failed for ${cid}`, { e })
      }
    },
    10
  )

  // A resolved answer has paid out its pool and its subsidy and never pays out
  // again, so nothing goes into it (see drizzleMarket).
  const answers = await pg.map(
    `select * from answers where subsidy_pool > 1e-7 and resolution is null`,
    [],
    convertAnswer
  )

  log('found', answers.length, 'answers to drizzle')

  // Per-answer subsidies (from a per-answer addLiquidity, or an independent answer's share of a
  // whole-market add while it's outside 1%-99%) drizzle here, once every drizzleMarket above has
  // finished, so the two phases never contend. drizzleAnswer's row lock orders it with the API's
  // writes to the same answer (bets, per-answer adds, resolution). An answer's undrizzled
  // subsidy is paid out when it resolves.
  await mapAsync(answers, (answer) => drizzleAnswer(pg, answer.id), 10)
}

const drizzleMarket = async (contractId: string) => {
  await runTransactionWithRetries(async (pgTrans) => {
    const fetched = await getContract(pgTrans, contractId)
    if (!fetched) throw new APIError(404, 'Contract not found.')
    const contract = fetched as CPMMContract | CPMMMultiContract

    const { subsidyPool, slug, uniqueBettorCount } = contract
    if ((subsidyPool ?? 0) < 1e-7) return

    const r = Math.random()
    const v = (uniqueBettorCount ?? 0) < 50 ? 0.3 : 0.6
    const amount = subsidyPool <= 1 ? subsidyPool : r * v * subsidyPool

    if (isMultiCpmm(contract)) {
      // On an independent market, answers resolve one at a time, and a resolved
      // one has paid out its pool and its subsidy and never pays out again, so
      // any share of the subsidy sent there is lost to the providers. The whole
      // amount goes to the unresolved answers, as resolution splits the
      // contract's subsidy among them (resolveMarketHelper), and as the
      // per-answer add refuses a resolved answer.
      const answers = contract.answers.filter((a) => !a.resolution)
      if (!answers.length) {
        return
      }

      // cpmm-multi-2 markets take the lossless float-p subsidy: inject the mana into BOTH reserves
      // of each answer and let that answer's p absorb it, so each probability is preserved with no
      // discarded shares (the same move the binary CPMM makes in addCpmmLiquidity). Sum-to-one
      // keeps Σ prob = 1 as a consequence (GP6a); independent answers are each their own binary
      // market. This only DEEPENS an already-converted v2 market — drizzle NEVER converts a v1
      // market (conversion is gated to an explicit user addLiquidity, so the scheduler can't flip
      // fill semantics under resting orders; see migration policy). So any in-flight v1 subsidy
      // keeps draining through the frozen v1 fixed-p path below, unchanged.
      const isV2 = contract.mechanism === 'cpmm-multi-2'

      let answerUpdates: (Partial<Answer> & { id: string })[]
      // Shares of the subsidy that independent answers outside 1%-99% hold as
      // their own pending subsidy.
      let pendingByAnswer: [string, number][] = []
      if (isV2) {
        const poolsByAnswer = Object.fromEntries(
          answers.map((a) => [
            a.id,
            { pool: { YES: a.poolYes, NO: a.poolNo }, p: a.p },
          ])
        )
        // With no answer inside 1%-99%, the subsidy waits.
        if (!canDeployCpmmMulti2Liquidity(poolsByAnswer)) return
        const independent = contract.shouldAnswersSumToOne
          ? undefined
          : addCpmmMultiLiquidityToAnswersIndependentlyV2(poolsByAnswer, amount)
        const newByAnswer =
          independent ??
          addCpmmMultiLiquidityAnswersSumToOneV2(poolsByAnswer, amount)
        pendingByAnswer = Object.entries(independent ?? {})
          .map(([answerId, { pendingSubsidy }]): [string, number] => [
            answerId,
            pendingSubsidy,
          ])
          .filter(([, pending]) => pending > 0)
        answerUpdates = Object.entries(newByAnswer)
          .slice(0, 50_000)
          .map(([answerId, { pool, p }]) => ({
            id: answerId,
            poolYes: pool.YES,
            poolNo: pool.NO,
            p,
            prob: getCpmmProbability(pool, p),
          }))
      } else {
        // cpmm-multi-1 (frozen v1): lossy fixed-p add, p pinned at 0.5.
        const poolsByAnswer = Object.fromEntries(
          answers.map((a) => [a.id, { YES: a.poolYes, NO: a.poolNo }])
        )
        const newPools = contract.shouldAnswersSumToOne
          ? addCpmmMultiLiquidityAnswersSumToOne(poolsByAnswer, amount)
          : addCpmmMultiLiquidityToAnswersIndependently(poolsByAnswer, amount)

        answerUpdates = Object.entries(newPools)
          .slice(0, 50_000)
          .map(([answerId, newPool]) => ({
            id: answerId,
            poolYes: newPool.YES,
            poolNo: newPool.NO,
            prob: getCpmmProbability(newPool, 0.5),
          }))
      }

      await updateAnswers(pgTrans, contractId, answerUpdates)
      // Atomic, as drizzleAnswer read-modify-writes subsidy_pool in its own tx.
      // The broadcast above doesn't carry subsidyPool, so send each new pending
      // balance too, or open pages count it as active liquidity.
      const pendingUpdates: { id: string; subsidyPool: number }[] = []
      for (const [answerId, pending] of pendingByAnswer) {
        const row = await pgTrans.oneOrNone<{ subsidy_pool: number }>(
          `update answers set subsidy_pool = subsidy_pool + $1 where id = $2
          returning subsidy_pool`,
          [pending, answerId]
        )
        if (row)
          pendingUpdates.push({ id: answerId, subsidyPool: row.subsidy_pool })
      }
      broadcastUpdatedAnswers(contractId, pendingUpdates)

      await updateContract(pgTrans, contract.id, {
        subsidyPool: subsidyPool - amount,
      })
    } else {
      const { pool, p } = contract
      const { newPool, newP } = addCpmmLiquidity(pool, p, amount)

      if (!isFinite(newP)) {
        throw new APIError(
          500,
          'Liquidity injection rejected due to overflow error.'
        )
      }

      await updateContract(pgTrans, contract.id, {
        pool: newPool,
        p: newP,
        subsidyPool: subsidyPool - amount,
      })
    }

    log(
      'added subsidy',
      formatMoneyWithDecimals(amount),
      'of',
      formatMoneyWithDecimals(subsidyPool),
      'pool to',
      slug
    )
  })
}

const drizzleAnswer = async (pg: SupabaseDirectClient, answerId: string) => {
  await pg.tx(async (tx) => {
    // Row-locked read: this tx read-modify-writes subsidyPool (and pools) with concrete
    // values, racing the per-answer addLiquidity API path in another process.
    const answer = await getAnswerForUpdate(tx, answerId)
    if (!answer) return
    // Resolved since it was listed: its subsidy was paid out at resolution
    // (resolveMarketHelper), and a pool it can't pay out again shouldn't take any.
    if (answer.resolution) return

    const { subsidyPool, poolYes, poolNo } = answer
    if ((subsidyPool ?? 0) < 1e-7) return

    const r = Math.random()
    const amount = subsidyPool <= 1 ? subsidyPool : r * 0.4 * subsidyPool

    const pool = { YES: poolYes, NO: poolNo }

    // A cpmm-multi-2 answer is its own binary CPMM, so it takes the lossless float-p add (inject
    // into both reserves, float p to hold its probability — no discarded shares, prob preserved).
    // cpmm-multi-1 stays on the frozen lossy fixed-p add (which pins p = 0.5 and clobbers prob to
    // N/(Y+N)). Drizzle only deepens — it never converts (that's the explicit user addLiquidity).
    // Read just the mechanism column, but INSIDE the tx (a v1->v2 conversion can flip it; a
    // stale pre-job read could apply the lossy v1 add to a converted market) — the win over
    // getContract is skipping the whole data-blob fetch+convert once per subsidized answer.
    const row = await tx.oneOrNone<{ mechanism: string }>(
      `select mechanism from contracts where id = $1`,
      [answer.contractId]
    )
    const isV2 = row?.mechanism === 'cpmm-multi-2'
    if (isV2 && !isDeepenableProb(getCpmmProbability(pool, answer.p))) return

    const { newPool, newP } = isV2
      ? addCpmmLiquidity(pool, answer.p, amount)
      : { ...addCpmmLiquidityFixedP(pool, amount), newP: 0.5 }

    if (!isFinite(newPool.YES) || !isFinite(newPool.NO) || !isFinite(newP)) {
      throw new APIError(
        500,
        'Liquidity injection rejected due to overflow error.'
      )
    }

    await updateAnswer(tx, answerId, {
      poolYes: newPool.YES,
      poolNo: newPool.NO,
      ...(isV2 ? { p: newP } : {}),
      prob: getCpmmProbability(newPool, newP),
      subsidyPool: subsidyPool - amount,
    })

    log(
      'added subsidy',
      newPool.YES - pool.YES,
      'YES and',
      newPool.NO - pool.NO,
      'NO:',
      formatMoneyWithDecimals(amount),
      'of',
      formatMoneyWithDecimals(subsidyPool),
      'pool to',
      answer.text
    )
  })
}
