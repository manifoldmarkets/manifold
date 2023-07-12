import * as admin from 'firebase-admin'
import { z } from 'zod'

import { User } from 'common/user'
import { APIError, authEndpoint, validate } from './helpers'
import { FieldValue } from 'firebase-admin/firestore'
import { postTweet } from 'shared/twitter'

const bodySchema = z.object({
  tweet: z.string().trim().min(1).max(280),
})

const MANACHAN_TWEET_COST = 1000

export const manachantweet = authEndpoint(async (req, auth) => {
  const { tweet } = validate(bodySchema, req.body)

  const firestore = admin.firestore()

  const user = await firestore.runTransaction(async (transaction) => {
    const userDoc = firestore.doc(`users/${auth.uid}`)
    const userSnap = await transaction.get(userDoc)
    if (!userSnap.exists) throw new APIError(400, 'User not found')
    const user = userSnap.data() as User

    if (user.balance < MANACHAN_TWEET_COST)
      throw new APIError(400, 'Insufficient balance')

    transaction.update(userDoc, {
      balance: FieldValue.increment(-MANACHAN_TWEET_COST),
      totalDeposits: FieldValue.increment(-MANACHAN_TWEET_COST),
    })

    return user
  })

  const result = await postTweet(tweet)

  firestore.collection('manachan-tweets').add({
    userId: auth.uid,
    username: user.name,
    tweetId: result.id,
    tweet: result.text,
    createdTime: Date.now(),
    cost: MANACHAN_TWEET_COST,
  })

  return { success: true, tweetId: result.id }
})
