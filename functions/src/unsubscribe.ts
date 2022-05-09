import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import * as _ from 'lodash'
import { getUser } from './utils'
import { PrivateUser } from 'common/user'

export const unsubscribe = functions
  .runWith({ minInstances: 1 })
  .https.onRequest(async (req, res) => {
    let { id, type } = req.query as { id: string; type: string }
    if (!id || !type) {
      res.status(400).send('Empty id or type parameter.')
      return
    }

    if (type === 'market-resolved') type = 'market-resolve'

    if (!['market-resolve', 'market-comment', 'market-answer'].includes(type)) {
      res.status(400).send('Invalid type parameter.')
      return
    }

    const user = await getUser(id)

    if (user) {
      const { name } = user

      const update: Partial<PrivateUser> = {
        ...(type === 'market-resolve' && {
          unsubscribedFromResolutionEmails: true,
        }),
        ...(type === 'market-comment' && {
          unsubscribedFromCommentEmails: true,
        }),
        ...(type === 'market-answer' && {
          unsubscribedFromAnswerEmails: true,
        }),
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
      else if (type === 'market-answer')
        res.send(
          `${name}, you have been unsubscribed from market answer emails on Manifold Markets.`
        )
      else res.send(`${name}, you have been unsubscribed.`)
    } else {
      res.send('This user is not currently subscribed or does not exist.')
    }
  })

const firestore = admin.firestore()
