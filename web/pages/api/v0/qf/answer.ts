import {
  CORS_ORIGIN_MANIFOLD,
  CORS_ORIGIN_LOCALHOST,
} from 'common/envs/constants'
import { NextApiRequest, NextApiResponse } from 'next'
import { applyCorsHeaders } from 'web/lib/api/cors'
import * as admin from 'firebase-admin'
import { z } from 'zod'
import { getUserId, initAdmin, safeGet } from '../_firebase-utils'
import { validate } from '../_validate'
import { QuadraticFundingContract } from 'common/contract'
import { User } from 'common/user'
import { Answer } from 'common/answer'

export const config = { api: { bodyParser: true } }

initAdmin()
const firestore = admin.firestore()

// Split "amount" of mana between all holders of the cert.
const schema = z.object({
  qfId: z.string(),
  text: z.string(),
  receiverId: z.string().optional(),
})
export type QfAnswerReq = {
  qfId: string
  text: string
  // If set, payments go to this user instead of the requester
  // TODO: Is this useful for all Qf payments?
  // Pro: Allows me to set up an ideal blog prize tourney
  // Con: Kind of allows lying about who made this. So... maybe only enable for the Qf creator?
  receiverId?: string
}

export default async function route(req: NextApiRequest, res: NextApiResponse) {
  await applyCorsHeaders(req, res, {
    origin: [CORS_ORIGIN_MANIFOLD, CORS_ORIGIN_LOCALHOST],
    methods: 'POST',
  })

  const userId = await getUserId(req, res)

  const resp = await createAnswer(req, userId)

  return res.status(200).json(resp)
}

async function createAnswer(req: NextApiRequest, userId: string) {
  // TODO: could wrap in a Firestore transaction
  const { qfId, text, receiverId } = validate(schema, req.body)

  const qf = await safeGet<QuadraticFundingContract>(`contracts/${qfId}`)
  const answerUserId = receiverId ?? userId
  const answerUser = await safeGet<User>(`users/${answerUserId}`)

  const newAnswer: Answer = {
    id: `${qf.answers.length}`,
    number: qf.answers.length,
    contractId: qfId,
    createdTime: Date.now(),

    // Note: This probably won't update if the user changes their name
    userId: answerUserId,
    username: answerUser.username,
    name: answerUser.name,
    avatarUrl: answerUser.avatarUrl,

    text,
  }

  // Update the qf doc
  const newAnswers = [...qf.answers, newAnswer]
  await firestore.doc(`contracts/${qfId}`).update({ answers: newAnswers })

  return { newAnswer }
}
