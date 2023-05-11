import * as admin from 'firebase-admin'
import { z } from 'zod'

import { authEndpoint, validate } from './helpers'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { runTxn } from 'shared/run-txn'
import { randomString } from 'common/util/random'
import { QAndACreateTxn } from 'common/txn'
import { isProd } from 'shared/utils'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'

const bodySchema = z.object({
  question: z.string(),
  description: z.string(),
  bounty: z.number(),
})

export const createQAndA = authEndpoint(async (req, auth) => {
  const { question, description, bounty } = validate(bodySchema, req.body)
  const userId = auth.uid

  const pg = createSupabaseDirectClient()
  const firestore = admin.firestore()
  const ref = firestore.collection('txns').doc()

  const q_and_a_id = randomString()

  const data: QAndACreateTxn = {
    id: ref.id,
    fromId: auth.uid,
    fromType: 'USER',
    toId: isProd()
      ? HOUSE_LIQUIDITY_PROVIDER_ID
      : DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
    toType: 'BANK',
    amount: bounty,
    token: 'M$',
    category: 'Q_AND_A_CREATE',
    data: {
      q_and_a_id,
    },
    createdTime: Date.now(),
  }
  await firestore.runTransaction(async (transaction) => {
    await runTxn(transaction, data)
  })

  await pg.one<{ id: string }>(
    `insert into q_and_a (id, user_id, question, description, bounty)
  values ($1, $2, $3, $4, $5)
  returning id
`,
    [q_and_a_id, userId, question, description, bounty]
  )

  return { status: 'success', data: { id: q_and_a_id } }
})
