import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import * as _ from 'lodash'
import { getPrivateUser } from './utils'
import { PrivateUser } from '../../common/user'

export const unsubscribe = functions
  .runWith({ minInstances: 1 })
  .https.onRequest(async (req, res) => {
    let id = req.query.id as string
    if (!id) return

    let privateUser = await getPrivateUser(id)

    if (privateUser) {
      let { username } = privateUser

      const update: Partial<PrivateUser> = {
        unsubscribedFromResolutionEmails: true,
      }

      await firestore.collection('private-users').doc(id).update(update)

      res.send(
        username +
          ', you have been unsubscribed from market resolution emails on Manifold Markets.'
      )
    } else {
      res.send('This user is not currently subscribed or does not exist.')
    }
  })

const firestore = admin.firestore()
