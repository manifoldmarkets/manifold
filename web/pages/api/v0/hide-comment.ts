import {
  CORS_ORIGIN_MANIFOLD,
  CORS_ORIGIN_LOCALHOST,
  isAdminId,
} from 'common/envs/constants'
import { NextApiRequest, NextApiResponse } from 'next'
import { applyCorsHeaders } from 'web/lib/api/cors'
import * as admin from 'firebase-admin'
import { z } from 'zod'
import { getUserId, initAdmin } from 'web/pages/api/v0/_firebase-utils'
import { validate } from './_validate'
import { Contract } from 'common/contract'

export const config = { api: { bodyParser: true } }

initAdmin()
const firestore = admin.firestore()

const schema = z.object({
  commentPath: z.string(),
})
export type HideCommentReq = {
  // eg 'contracts/iisfjklsd/comments/1jdkisjoof'
  commentPath: string
}

export default async function route(req: NextApiRequest, res: NextApiResponse) {
  await applyCorsHeaders(req, res, {
    origin: [CORS_ORIGIN_MANIFOLD, CORS_ORIGIN_LOCALHOST],
    methods: 'POST',
  })
  const { commentPath } = validate(schema, req.body)

  // Get the private-user to verify if user has an admin email
  const userId = await getUserId(req, res)

  // Extract contractId from commentPath
  const contractId = commentPath.split('/')[1]
  const contractDoc = await firestore.doc(`contracts/${contractId}`).get()
  const contract = contractDoc.data() as Contract
  const isContractCreator = contract.creatorId === userId

  if (!isAdminId(userId) && !isContractCreator) {
    return res
      .status(401)
      .json({ error: 'Only the market creator or an admin can hide markets' })
  }

  await hideComment(commentPath, userId)
  return res.status(200).json({ success: true })
}

async function hideComment(commentPath: string, userId: string) {
  const commentDoc = await firestore.doc(commentPath).get()
  const comment = commentDoc.data()
  if (!comment) {
    throw new Error('Comment not found')
  }
  await commentDoc.ref.update({
    hidden: !comment.hidden,
    hiddenTime: Date.now(),
    hiderId: userId,
  })
}
