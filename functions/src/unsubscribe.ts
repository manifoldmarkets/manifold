import * as admin from 'firebase-admin'
import { EndpointDefinition } from './api'
import { getUser } from './utils'
import { PrivateUser } from '../../common/user'

export const unsubscribe: EndpointDefinition = {
  opts: { method: 'GET', minInstances: 1 },
  handler: async (req, res) => {
    const id = req.query.id as string
    let type = req.query.type as string
    if (!id || !type) {
      res.status(400).send('Empty id or type parameter.')
      return
    }

    if (type === 'market-resolved') type = 'market-resolve'

    if (
      ![
        'market-resolve',
        'market-comment',
        'market-answer',
        'generic',
        'weekly-trending',
      ].includes(type)
    ) {
      res.status(400).send('Invalid type parameter.')
      return
    }

    const user = await getUser(id)

    if (!user) {
      res.send('This user is not currently subscribed or does not exist.')
      return
    }

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
      ...(type === 'generic' && {
        unsubscribedFromGenericEmails: true,
      }),
      ...(type === 'weekly-trending' && {
        unsubscribedFromWeeklyTrendingEmails: true,
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
    else if (type === 'weekly-trending')
      res.send(
        `${name}, you have been unsubscribed from weekly trending emails on Manifold Markets.`
      )
    else res.send(`${name}, you have been unsubscribed.`)
  },
}

const firestore = admin.firestore()
