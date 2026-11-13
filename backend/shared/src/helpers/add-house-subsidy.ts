import {
  CPMMContract,
  CPMMMultiContract,
  isMultiCpmm,
  MultiContract,
} from 'common/contract'
import { getContractSupabase, isProd } from 'shared/utils'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'
import { getNewLiquidityProvision } from 'common/add-liquidity'
import { insertLiquidity } from 'shared/supabase/liquidity'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError } from 'common/api/utils'
import { updateContract } from 'shared/supabase/contracts'
import { FieldVal } from 'shared/supabase/utils'
import { addSubsidyToOpenAnswers } from 'shared/supabase/answers'
import { runTransactionWithRetries } from 'shared/transact-with-retries'
import { broadcastUpdatedAnswers } from 'shared/websockets/helpers'

export const addHouseSubsidy = async (contractId: string, amount: number) => {
  const pg = createSupabaseDirectClient()

  const contract = await getContractSupabase(contractId)
  if (!contract) {
    throw new APIError(500, 'Contract not found')
  }

  const providerId = isProd()
    ? HOUSE_LIQUIDITY_PROVIDER_ID
    : DEV_HOUSE_LIQUIDITY_PROVIDER_ID

  if (isMultiCpmm(contract) && !contract.shouldAnswersSumToOne) {
    await addHouseSubsidyToOpenAnswers(contract, providerId, amount)
    return
  }

  const newLiquidityProvision = getNewLiquidityProvision(
    providerId,
    amount,
    contract as CPMMContract | CPMMMultiContract
  )

  await pg.tx(async (tx) => {
    await insertLiquidity(tx, newLiquidityProvision)
    await updateContract(tx, contractId, {
      subsidyPool: FieldVal.increment(amount),
      totalLiquidity: FieldVal.increment(amount),
    })
  })
}

// An independent market's open answers take it as their own pending subsidy,
// in equal shares, as a user's whole-market add does (addSubsidyToOpenAnswers).
const addHouseSubsidyToOpenAnswers = async (
  contract: MultiContract,
  providerId: string,
  amount: number
) => {
  // Retried on a deadlock: this locks the market's row, then its open answers,
  // as bets do, where the drizzle and resolution lock an answer first.
  const answers = await runTransactionWithRetries(
    async (tx) => {
      await tx.oneOrNone(`select 1 from contracts where id = $1 for update`, [
        contract.id,
      ])
      const answers = await addSubsidyToOpenAnswers(tx, contract.id, amount)
      // With every answer resolved, nothing would ever pay it out.
      if (answers.length === 0) return answers
      await updateContract(tx, contract.id, {
        totalLiquidity: FieldVal.increment(amount),
      })
      await insertLiquidity(
        tx,
        getNewLiquidityProvision(
          providerId,
          amount,
          contract,
          undefined,
          answers.map((a) => a.id)
        )
      )
      return answers
    },
    3,
    { mode: 'default' }
  )
  // Open pages would otherwise count the pending subsidy as active liquidity.
  if (answers.length > 0) broadcastUpdatedAnswers(contract.id, answers)
}

export const addHouseSubsidyToAnswer = async (
  contractId: string,
  answerId: string,
  amount: number
) => {
  const pg = createSupabaseDirectClient()

  const contract = await getContractSupabase(contractId)
  if (!contract) {
    throw new APIError(500, 'Contract not found')
  }

  const providerId = isProd()
    ? HOUSE_LIQUIDITY_PROVIDER_ID
    : DEV_HOUSE_LIQUIDITY_PROVIDER_ID

  const newLiquidityProvision = getNewLiquidityProvision(
    providerId,
    amount,
    contract as CPMMContract | CPMMMultiContract,
    answerId
  )

  await pg.tx(async (tx) => {
    // Match bets and answer creation: lock the contract before its answer.
    // Taking these in reverse order can drop this post-bet subsidy on deadlock.
    await tx.one('select 1 from contracts where id = $1 for update', [
      contractId,
    ])
    await insertLiquidity(tx, newLiquidityProvision)

    await tx.none(
      `update answers
      set
        total_liquidity = total_liquidity + $1,
        subsidy_pool = subsidy_pool + $1
      where id = $2`,
      [amount, answerId]
    )

    await updateContract(tx, contractId, {
      totalLiquidity: FieldVal.increment(amount),
    })
  })
}
