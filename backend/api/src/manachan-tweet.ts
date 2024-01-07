import * as admin from 'firebase-admin'
import { z } from 'zod'

import { User } from 'common/user'
import { APIError, authEndpoint, validate } from './helpers/endpoint'
import { FieldValue } from 'firebase-admin/firestore'
import { postTweet } from 'shared/twitter'
import { MANACHAN_TWEET_COST } from 'common/economy'
import { createSupabaseClient } from 'shared/supabase/init'

const bodySchema = z
  .object({
    tweet: z.string().trim().min(1).max(280),
  })
  .strict()

export const manachantweet = authEndpoint(async (req, auth) => {
  const { tweet } = validate(bodySchema, req.body)

  const firestore = admin.firestore()
  const db = createSupabaseClient()

  const user = await firestore.runTransaction(async (transaction) => {
    const userDoc = firestore.doc(`users/${auth.uid}`)
    const userSnap = await transaction.get(userDoc)
    if (!userSnap.exists) throw new APIError(401, 'Your account was not found')
    const user = userSnap.data() as User

    if (user.balance < MANACHAN_TWEET_COST)
      throw new APIError(403, 'Insufficient balance')

    transaction.update(userDoc, {
      balance: FieldValue.increment(-MANACHAN_TWEET_COST),
      totalDeposits: FieldValue.increment(-MANACHAN_TWEET_COST),
    })

    return user
  })

  const result = await postTweet(tweet)

  const { error } = await db.from('manachan_tweets').insert({
    user_id: auth.uid,
    username: user.name,
    tweet_id: result.id,
    tweet: result.text,
    created_time: Date.now(),
    cost: MANACHAN_TWEET_COST,
  })

  if (error)
    throw new APIError(
      500,
      'Tweet succeeded but to log tweet to database: ' + error.message
    )

  return { success: true, tweetId: result.id }
})
