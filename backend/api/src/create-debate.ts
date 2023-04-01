import * as admin from 'firebase-admin'
import { z } from 'zod'
import { MAX_QUESTION_LENGTH } from 'common/contract'
import { APIError, authEndpoint, validate } from './helpers'
import { createMarketHelper } from './create-market'
import { HOUR_MS } from 'common/util/time'
import { runTxn } from 'shared/run-txn'
import { revalidateStaticProps } from 'shared/utils'

const bodySchema = z.object({
  topic1: z.string().min(1).max(MAX_QUESTION_LENGTH),
  topic2: z.string().min(1).max(MAX_QUESTION_LENGTH),
})

const debateBotUserId = 'PzOAq29wOnWw401h613wyQPvbZF2'
const debateGroupId = '0i8ozKhPq5qJ89DG9tCW'
// Debate group url: https://manifold.markets/group/debate-31ace66e7215/markets

export const createDebate = authEndpoint(async (req, auth) => {
  const { topic1, topic2 } = validate(bodySchema, req.body)

  // Charge the user 50 mana.
  const cost = 50
  const firestore = admin.firestore()
  await firestore.runTransaction(async (transaction) => {
    const result = await runTxn(transaction, {
      fromId: auth.uid,
      fromType: 'USER',
      toId: debateBotUserId,
      toType: 'USER',
      amount: cost,
      token: 'M$',
      category: 'MANALINK',
    })
    if (result.status == 'error') {
      throw new APIError(500, result.message ?? 'An unknown error occurred.')
    }
    return result
  })

  // Create the debate market!
  const createParams = {
    question: `${topic1} vs ${topic2}`,
    descriptionMarkdown: `Yes = ${topic1}\n\nNo = ${topic2}\n\nMake your bets!`,
    initialProb: 50,
    closeTime: Date.now() + HOUR_MS,
    outcomeType: 'BINARY' as const,
    groupId: debateGroupId,
    visibility: 'public' as const,
  }
  const fakeAuthForDebateBot = { uid: debateBotUserId, creds: {} as any }
  const contract = await createMarketHelper(createParams, fakeAuthForDebateBot)
  console.log(
    'Created debate market: ',
    contract.id,
    'for user: ',
    auth.uid,
    contract.slug
  )

  await revalidateStaticProps('/debate')

  return contract
})
