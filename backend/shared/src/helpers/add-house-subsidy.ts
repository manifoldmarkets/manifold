import * as admin from 'firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'

import { CPMMContract, CPMMMultiContract } from 'common/contract'
import { getContractSupabase, isProd } from 'shared/utils'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'
import { getNewLiquidityProvision } from 'common/add-liquidity'
import { insertLiquidity } from 'shared/supabase/liquidity'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError } from 'common/api/utils'

const firestore = admin.firestore()

export const addHouseSubsidy = async (contractId: string, amount: number) => {
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
    contract as CPMMContract | CPMMMultiContract
  )

  await pg.tx(async (tx) => {
    await insertLiquidity(tx, newLiquidityProvision)

    await firestore.doc(`contracts/${contractId}`).update({
      subsidyPool: FieldValue.increment(amount),
      totalLiquidity: FieldValue.increment(amount),
    })
  })
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
    await insertLiquidity(tx, newLiquidityProvision)

    await tx.none(
      `update answers
      set data = data ||
        jsonb_build_object('totalLiquidity', data->>'totalLiquidity'::numeric + $1) ||
        jsonb_build_object('subsidyPool', data->>'subsidyPool'::numeric + $1)
      where id = $2`,
      [amount, answerId]
    )

    await firestore.doc(`contracts/${contractId}`).update({
      totalLiquidity: FieldValue.increment(amount),
    })
  })
}
