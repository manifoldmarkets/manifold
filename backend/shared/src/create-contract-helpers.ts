import { getNewLiquidityProvision } from 'common/add-liquidity'
import { getCpmmInitialLiquidity } from 'common/antes'
import {
  BinaryContract,
  Contract,
  CPMMMultiContract,
  isMultiCpmm,
} from 'common/contract'
import { updateContract } from './supabase/contracts'
import { SupabaseDirectClient } from './supabase/init'
import { insertLiquidity } from './supabase/liquidity'
import { FieldVal } from './supabase/utils'
import { runTxnOutsideBetQueue } from './txn/run-txn'

export async function generateAntes(
  pg: SupabaseDirectClient,
  providerId: string,
  contract: Contract,
  ante: number,
  totalMarketCost: number
) {
  // NOTE: these branches must cover cpmm-multi-2 as well as cpmm-multi-1 — the
  // ante LiquidityProvision row is what records the creator as the pool's LP, so
  // that resolution returns the pools' resolved value to them (without it the
  // ante is stranded). `isMultiCpmm` covers both mechanisms.
  if (isMultiCpmm(contract) && !contract.shouldAnswersSumToOne) {
    const { answers } = contract
    // Each answer's pool was seeded with an even share of the ante. Record
    // that, not the pool's geometric mean: the two agree for an answer that
    // opened at 50%, but the mean understates it for one that opened
    // elsewhere, and this amount is what a cancellation refunds.
    const answerAnte = ante / answers.length
    for (const answer of answers) {
      const lp = getCpmmInitialLiquidity(
        providerId,
        contract,
        answerAnte,
        contract.createdTime,
        answer.id
      )

      await insertLiquidity(pg, lp)
    }
  } else if (isMultiCpmm(contract) || contract.mechanism === 'cpmm-1') {
    const lp = getCpmmInitialLiquidity(
      providerId,
      contract as BinaryContract | CPMMMultiContract,
      ante,
      contract.createdTime
    )

    await insertLiquidity(pg, lp)
  }
  const drizzledAmount = totalMarketCost - ante
  if (
    drizzledAmount > 0 &&
    (contract.mechanism === 'cpmm-1' || isMultiCpmm(contract))
  ) {
    return await pg.txIf(async (tx) => {
      await runTxnOutsideBetQueue(tx, {
        fromId: providerId,
        amount: drizzledAmount,
        toId: contract.id,
        toType: 'CONTRACT',
        category: 'ADD_SUBSIDY',
        token: 'M$',
        fromType: 'USER',
      })
      const newLiquidityProvision = getNewLiquidityProvision(
        providerId,
        drizzledAmount,
        contract
      )

      await insertLiquidity(tx, newLiquidityProvision)

      await updateContract(tx, contract.id, {
        subsidyPool: FieldVal.increment(drizzledAmount),
        totalLiquidity: FieldVal.increment(drizzledAmount),
      })
    })
  }
}
