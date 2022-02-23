import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import * as _ from 'lodash'
import { getUser } from './utils'
import { PrivateUser } from '../../common/user'

export const unsubscribe = functions
  .runWith({ minInstances: 1 })
  .https.onRequest(async (req, res) => {
    const { id, type } = req.query as { id: string; type: string }
    if (!id || !type) return

    const user = await getUser(id)

    if (user) {
      const { name } = user

      const update: Partial<PrivateUser> = {
        unsubscribedFromResolutionEmails: type === 'market-resolve',
        unsubscribedFromCommentEmails: type === 'market-comment',
      }

      await firestore.collection('private-users').doc(id).update(update)

      if (type === 'market-resolve')
        res.send(
          `${name}, you have been unsubscribed from market resolution emails on Manifold Markets.`
        )
      else if (type === 'market-comment')
        res.send(
          `${name}, you have been unsubscribed from market comment emails on Manifold Markets.`
        )
      else res.send(`${name}, you have been unsubscribed.`)
    } else {
      res.send('This user is not currently subscribed or does not exist.')
    }
  })

const firestore = admin.firestore()
