import { isAdminId, isModId } from 'common/envs/constants'
import {
  getContract,
  getUser,
  revalidateContractStaticProps,
} from 'shared/utils'
import { getComment } from 'shared/supabase/contract-comments'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateData } from 'shared/supabase/utils'
import { APIError, type APIHandler } from './helpers/endpoint'
import { trackPublicEvent } from 'shared/analytics'

export const hideComment: APIHandler<'hide-comment'> = async (
  { commentPath, action = 'hide' },
  auth
) => {
  // Comment path is of the form /[username]/[contractId]/comment/[commentId] because firebase
  const [, contractId, , commentId] = commentPath.split('/')
  if (!contractId || !commentId) {
    throw new APIError(
      400,
      'Invalid comment path. If you can read this, tell sinclair to change this endpoint to have more sensible inputs'
    )
  }

  const pg = createSupabaseDirectClient()
  const user = await getUser(auth.uid)
  if (!user) throw new APIError(404, 'User not found')
  if (user.isBannedFromPosting || user.userDeleted)
    throw new APIError(
      403,
      'You are banned from posting or your account has been deleted'
    )

  const contract = await getContract(pg, contractId)
  if (!contract) throw new APIError(404, 'Contract not found')

  const isContractCreator = contract.creatorId === auth.uid
  const isAdmin = isAdminId(auth.uid)
  const isMod = isModId(auth.uid)

  // For delete action, only admins and mods can delete (not contract creators)
  if (action === 'delete') {
    if (!isAdmin && !isMod) {
      throw new APIError(
        403,
        'Only admins and mods can delete comments'
      )
    }
  } else {
    // For hide action, contract creators, admins, and mods can hide
    if (!isAdmin && !isContractCreator && !isMod) {
      throw new APIError(
        403,
        'Only the market creator, admin, or mod can hide/unhide comments'
      )
    }
  }

  const comment = await getComment(pg, commentId)
  
  if ((isAdminId(comment.userId) || isModId(comment.userId)) && (action === 'delete' || !comment.hidden)) {
    throw new APIError(403, 'You cannot hide or delete comments from admins or mods')
  }

  // Update the comment based on action
  if (action === 'delete') {
    const shouldDelete = !comment.deleted
    await updateData(pg, 'contract_comments', 'comment_id', {
      comment_id: commentId,
      deleted: shouldDelete,
      deletedTime: shouldDelete ? Date.now() : undefined,
      deleterId: auth.uid,
    })
  } else {
    const hide = !comment.hidden
    await updateData(pg, 'contract_comments', 'comment_id', {
      comment_id: commentId,
      hidden: hide,
      hiddenTime: hide ? Date.now() : undefined,
      hiderId: auth.uid,
    })
  }

  await revalidateContractStaticProps(contract)
  return {
    result: { success: true },
    continue: async () => {
      await trackPublicEvent(auth.uid, action === 'delete' ? 'delete_comment' : 'hide_comment', {
        contractId,
        commentId,
        [action === 'delete' ? 'deleted' : 'hidden']: action === 'delete' ? !comment.deleted : !comment.hidden,
        userId: auth.uid,
      })
    },
  }
}
