import * as admin from 'firebase-admin'
import { z } from 'zod'

import { User } from 'common/user'
import { Bid } from 'common/bid'
import { APIError, authEndpoint, validate } from './helpers'
import { max } from 'lodash'

const bodySchema = z.object({
  amount: z.number().gte(1),
})

const CUTOFF_TIME = 1680418800000 // Apr 2nd, 12 am PT

export const auctionbid = authEndpoint(async (req, auth) => {
  if (Date.now() >= CUTOFF_TIME) throw new APIError(400, 'Auction closed')

  const { amount } = validate(bodySchema, req.body)

  if (!isFinite(amount) || amount < 1) throw new APIError(400, 'Invalid amount')

  await firestore.runTransaction(async (transaction) => {
    const userDoc = firestore.doc(`users/${auth.uid}`)
    const userSnap = await transaction.get(userDoc)
    if (!userSnap.exists) throw new APIError(400, 'User not found')
    const user = userSnap.data() as User

    const bidSnap = await transaction.get(firestore.collection('apr1-auction'))
    const bids = bidSnap.docs.map((doc) => doc.data() as Bid)
    const maxBid = max(bids.map((bid) => bid.amount)) ?? 0

    const nextBidThreshold = Math.ceil(maxBid * 1.1)
    if (amount < nextBidThreshold) throw new APIError(400, 'Bid too low')

    const userBids = bids.filter((bid) => bid.userId === user.id)
    const maxPrev = max(userBids.map((bid) => bid.amount)) ?? 0
    const cost = amount - maxPrev

    if (user.balance < cost) throw new APIError(400, 'Insufficient balance')
    const newBalance = user.balance - cost
    const newTotalDeposits = user.totalDeposits - cost
    if (!isFinite(newBalance))
      throw new APIError(500, 'Invalid user balance for ' + user.username)

    transaction.update(userDoc, {
      balance: newBalance,
      totalDeposits: newTotalDeposits,
    })

    transaction.create(firestore.collection('apr1-auction').doc(), {
      createdTime: Date.now(),
      amount,
      userId: user.id,
      username: user.username,
      avatar: user?.avatarUrl ?? '',
      displayName: user.name,
    } as Bid)
  })

  return { success: true }
})

const firestore = admin.firestore()
