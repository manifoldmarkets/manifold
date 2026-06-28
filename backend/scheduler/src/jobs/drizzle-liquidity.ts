import { CPMMContract, CPMMMultiContract, isMultiCpmm } from 'common/contract'
import { mapAsync } from 'common/util/promise'
import { APIError } from 'common/api/utils'
import {
  addCpmmLiquidity,
  addCpmmLiquidityFixedP,
  addCpmmMultiLiquidityAnswersSumToOne,
  addCpmmMultiLiquidityAnswersSumToOneV2,
  addCpmmMultiLiquidityToAnswersIndependently,
  getCpmmProbability,
} from 'common/calculate-cpmm'
import { Answer } from 'common/answer'
import { formatMoneyWithDecimals } from 'common/util/format'
import { shuffle } from 'lodash'
import {
  SupabaseDirectClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { convertAnswer } from 'common/supabase/contracts'
import { getAnswer, updateAnswer, updateAnswers } from 'shared/supabase/answers'
import { runTransactionWithRetries } from 'shared/transact-with-retries'
import { getContract, log } from 'shared/utils'
import { updateContract } from 'shared/supabase/contracts'

export const drizzleLiquidity = async () => {
  const pg = createSupabaseDirectClient()

  const data = await pg.manyOrNone<{ id: string }>(
    `select id from contracts where (data->'subsidyPool')::numeric > 1e-7`
  )
  const contractIds = shuffle(data.map((doc) => doc.id))
  log('found', contractIds.length, 'markets to drizzle')

  await mapAsync(contractIds, (cid) => drizzleMarket(cid), 10)

  const answers = await pg.map(
    `select * from answers where subsidy_pool > 1e-7`,
    [],
    convertAnswer
  )

  log('found', answers.length, 'answers to drizzle')

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
      const answers = contract.answers
      if (!answers.length) {
        return
      }

      // cpmm-multi-2 sum-to-one markets take the lossless float-p subsidy: inject into both
      // reserves and let each answer's p absorb the mana, so probability is preserved with no
      // discarded shares. This only DEEPENS an already-converted v2 market — drizzle never
      // converts a v1 market (conversion is gated to an explicit user addLiquidity, so the
      // scheduler can't flip fill semantics under resting orders; see migration policy).
      const isV2SumToOne =
        contract.mechanism === 'cpmm-multi-2' && contract.shouldAnswersSumToOne

      let answerUpdates: (Partial<Answer> & { id: string })[]
      if (isV2SumToOne) {
        const poolsByAnswer = Object.fromEntries(
          answers.map((a) => [
            a.id,
            { pool: { YES: a.poolYes, NO: a.poolNo }, p: a.p },
          ])
        )
        const newByAnswer = addCpmmMultiLiquidityAnswersSumToOneV2(
          poolsByAnswer,
          amount
        )
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
    const answer = await getAnswer(tx, answerId)
    if (!answer) return

    const { subsidyPool, poolYes, poolNo } = answer
    if ((subsidyPool ?? 0) < 1e-7) return

    const r = Math.random()
    const amount = subsidyPool <= 1 ? subsidyPool : r * 0.4 * subsidyPool

    const pool = { YES: poolYes, NO: poolNo }
    const { newPool } = addCpmmLiquidityFixedP(pool, amount)

    if (!isFinite(newPool.YES) || !isFinite(newPool.NO)) {
      throw new APIError(
        500,
        'Liquidity injection rejected due to overflow error.'
      )
    }

    await updateAnswer(tx, answerId, {
      poolYes: newPool.YES,
      poolNo: newPool.NO,
      prob: getCpmmProbability(newPool, 0.5),
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
