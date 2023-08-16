import * as admin from 'firebase-admin'
import { z } from 'zod'
import { FieldValue } from 'firebase-admin/firestore'

import { APIError, authEndpoint, validate } from './helpers'
import { PrivateUser, User } from 'common/user'
import { DestinySub, DESTINY_SUB_COST } from 'common/destiny-sub'

const bodySchema = z.object({
  destinyUsername: z.string().trim().min(1),
})

export const claimdestinysub = authEndpoint(async (req, auth) => {
  const { destinyUsername } = validate(bodySchema, req.body)

  return await firestore.runTransaction(async (trans) => {
    const userSnap = await trans.get(
      firestore.collection('users').doc(auth.uid)
    )
    if (!userSnap.exists) throw new APIError(401, 'Your account was not found')
    const user = userSnap.data() as User

    const privateSnap = await trans.get(
      firestore.collection('private-users').doc(auth.uid)
    )
    if (!privateSnap.exists) throw new APIError(500, 'Private user not found')
    const privateUser = privateSnap.data() as PrivateUser

    if (privateUser.destinySub2Claimed)
      throw new APIError(403, 'Destiny sub already claimed.')

    if (user.balance < DESTINY_SUB_COST)
      throw new APIError(403, 'Insufficient balance.')

    const response = await fetch(
      'https://www.destiny.gg/api/mm/award-sub?privatekey=' +
        process.env.DESTINY_API_KEY,
      {
        method: 'post',
        body: JSON.stringify({ username: destinyUsername }),
        headers: { 'Content-Type': 'application/json' },
      }
    )

    const result = await response.json()
    const destinySubId = result?.data?.newSubId

    if (!destinySubId) {
      throw new APIError(500, 'Error claiming Destiny sub: ' + result?.message)
    }

    const subDoc = firestore.collection('destiny-subs2').doc()

    const sub: DestinySub = {
      id: subDoc.id,
      createdTime: Date.now(),
      destinySubId,
      cost: DESTINY_SUB_COST,
      userId: user.id,
      username: user.username,
      destinyUsername,
    }

    trans.create(subDoc, sub)
    trans.update(userSnap.ref, {
      balance: FieldValue.increment(-DESTINY_SUB_COST),
      totalDeposits: FieldValue.increment(-DESTINY_SUB_COST),
    })
    trans.update(privateSnap.ref, {
      destinySub2Claimed: true,
    } as Partial<PrivateUser>)

    console.log(
      'claimed destiny sub for',
      destinyUsername,
      'by Manifold user',
      user.username
    )

    return { success: true }
  })
})

const firestore = admin.firestore()
