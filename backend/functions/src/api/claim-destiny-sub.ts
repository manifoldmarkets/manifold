import * as admin from 'firebase-admin'
import { z } from 'zod'
import fetch from 'node-fetch'
import { FieldValue } from 'firebase-admin/firestore'

import { APIError, newEndpoint, validate } from './helpers'
import { PrivateUser, User } from 'common/user'
import { DestinySub, DESTINY_SUB_COST } from 'common/destiny-sub'

const bodySchema = z.object({
  destinyUsername: z.string().trim().min(1),
})

export const claimdestinysub = newEndpoint(
  { secrets: ['DESTINY_API_KEY'] },
  async (req, auth) => {
    const { destinyUsername } = validate(bodySchema, req.body)

    return await firestore.runTransaction(async (trans) => {
      const privateSnap = await trans.get(
        firestore.collection('private-users').doc(auth.uid)
      )
      if (!privateSnap.exists)
        throw new APIError(400, 'Private user not found.')
      const privateUser = privateSnap.data() as PrivateUser

      if (privateUser.destinySubClaimed)
        throw new APIError(400, 'Destiny sub already claimed.')

      const userSnap = await trans.get(
        firestore.collection('users').doc(auth.uid)
      )
      if (!userSnap.exists) throw new APIError(400, 'User not found.')

      const user = userSnap.data() as User
      if (user.balance < DESTINY_SUB_COST)
        throw new APIError(400, 'Insufficient balance.')

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
        throw new APIError(
          400,
          'Error claiming Destiny sub: ' + result?.message
        )
      }

      const subDoc = firestore.collection('destiny-subs').doc()

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
      trans.update(privateSnap.ref, { destinySubClaimed: true })

      return { success: true }
    })
  }
)

const firestore = admin.firestore()
