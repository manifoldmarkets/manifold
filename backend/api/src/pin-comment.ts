import * as admin from 'firebase-admin'
import { Contract } from 'common/contract'
import { isAdminId, isModId } from 'common/envs/constants'
import { getUser, revalidateContractStaticProps } from 'shared/utils'
import { APIError, type APIHandler } from './helpers/endpoint'

export const pinComment: APIHandler<'pin-comment'> = async (
  { commentPath },
  auth
) => {
  // Extract contractId from commentPath
  const contractId = commentPath.split('/')[1]
  const contractDoc = await firestore.doc(`contracts/${contractId}`).get()
  const contract = contractDoc.data() as Contract
  const isContractCreator = contract.creatorId === auth.uid

  if (!isAdminId(auth.uid) && !isContractCreator && !isModId(auth.uid)) {
    throw new APIError(
      403,
      'Only the market creator or mod can hide/unhide comments'
    )
  }

  // update the comment
  const commentDoc = await firestore.doc(commentPath).get()
  const comment = commentDoc.data()
  if (!comment) {
    throw new APIError(404, 'Comment not found')
  }

  await commentDoc.ref.update({
    pinned: !comment.pinned,
    pinnedTime: Date.now(),
    pinnerId: auth.uid,
  })

  await revalidateContractStaticProps(contract)
}

const firestore = admin.firestore()
