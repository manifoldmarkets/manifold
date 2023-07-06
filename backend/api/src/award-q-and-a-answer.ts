import * as admin from 'firebase-admin'
import { z } from 'zod'

import { q_and_a_answer, q_and_a } from 'common/q-and-a'
import { QAndAAwardTxn } from 'common/txn'
import { APIError, authEndpoint, validate } from './helpers'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  HOUSE_LIQUIDITY_PROVIDER_ID,
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'
import { runTxn } from 'shared/txn/run-txn'
import { isProd } from 'shared/utils'

const bodySchema = z.object({
  answerId: z.string(),
  amount: z.number(),
})

export const awardQAndAAnswer = authEndpoint(async (req, auth) => {
  const { answerId, amount } = validate(bodySchema, req.body)
  const userId = auth.uid

  const pg = createSupabaseDirectClient()

  console.log('awarding', answerId, amount)
  const answer = await pg.one<q_and_a_answer>(
    `select * from q_and_a_answers
    where id = $1`,
    [answerId]
  )
  console.log('answer', answer)
  if (!answer) {
    throw new APIError(404, 'Answer not found')
  }

  const question = await pg.one<q_and_a>(
    `select * from q_and_a
    where id = $1`,
    [answer.q_and_a_id]
  )
  console.log('question', question)

  if (!question) {
    throw new APIError(404, 'Question not found')
  }
  if (question.user_id !== userId) {
    throw new APIError(403, 'Only the question asker can award an answer')
  }

  const { award_total } = await pg.one<{ award_total: number }>(
    `select sum(award) as award_total
    from q_and_a_answers
    where q_and_a_id = $1
    `,
    [question.id]
  )
  const currentAwarded = +award_total
  if (question.bounty < currentAwarded + amount) {
    throw new APIError(400, 'Bounty is too low for award amount')
  }

  const firestore = admin.firestore()
  const ref = firestore.collection('txns').doc()
  const data: QAndAAwardTxn = {
    id: ref.id,
    fromId: isProd()
      ? HOUSE_LIQUIDITY_PROVIDER_ID
      : DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
    fromType: 'BANK',
    toId: auth.uid,
    toType: 'USER',
    amount,
    token: 'M$',
    category: 'Q_AND_A_AWARD',
    data: {
      q_and_a_id: question.id,
    },
    createdTime: Date.now(),
  }
  await firestore.runTransaction(async (transaction) => {
    await runTxn(transaction, data)
  })

  const newAward = +answer.award + amount
  await pg.none(
    `update q_and_a_answers
    set award = $1
    where id = $2`,
    [newAward, answerId]
  )

  return { status: 'success', data: { answerId } }
})
