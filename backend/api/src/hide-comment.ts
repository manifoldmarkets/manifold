import { isAdminId, isModId } from 'common/envs/constants'
import {
  getContract,
  getUser,
  revalidateContractStaticProps,
} from 'shared/utils'
import { getComment } from 'shared/supabase/contract-comments'
import { lockSocialThread } from 'shared/social-posts'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateData } from 'shared/supabase/utils'
import { APIError, type APIHandler } from './helpers/endpoint'
import { trackPublicEvent } from 'shared/analytics'
import { onlyUsersWhoCanPerformAction } from './helpers/rate-limit'

export const hideComment: APIHandler<'hide-comment'> =
  onlyUsersWhoCanPerformAction(
    'hideComment',
    async ({ commentPath, action = 'hide' }, auth, req) => {
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
      if (user.userDeleted)
        throw new APIError(403, 'Your account has been deleted')

      const contract = await getContract(pg, contractId)
      if (!contract) throw new APIError(404, 'Contract not found')

      const isContractCreator = contract.creatorId === auth.uid
      const isAdmin = isAdminId(auth.uid)
      const isMod = isModId(auth.uid)

      // For delete action, only admins and mods can delete (not contract creators)
      if (action === 'delete') {
        if (!isAdmin && !isMod) {
          throw new APIError(403, 'Only admins and mods can delete comments')
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
      if (comment.contractId !== contractId)
        throw new APIError(400, 'Comment does not belong to this market')

      if (
        (isAdminId(comment.userId) || isModId(comment.userId)) &&
        (action === 'delete' || !comment.hidden)
      ) {
        throw new APIError(
          403,
          'You cannot hide or delete comments from admins or mods'
        )
      }

      const linked = await pg.oneOrNone<{ id: string; removed: boolean }>(
        'select id, deleted_time is not null as removed from social_posts where market_comment_id=$1',
        [commentId]
      )
      // A comment that is live on Yap is removed from both places together. If
      // its Yap post is already gone, the comment is deleted here as usual.
      if (linked && !linked.removed && action === 'delete') {
        const { deleteSocialPost } = await import('./social-posts')
        await deleteSocialPost({ id: linked.id }, auth, req)
        return { result: { success: true }, continue: async () => {} }
      }

      // Update the comment based on action
      if (action === 'delete') {
        if (comment.deleted) {
          return { result: { success: true }, continue: async () => {} }
        }
        await updateData(pg, 'contract_comments', 'comment_id', {
          comment_id: commentId,
          deleted: true,
          deletedTime: Date.now(),
          deleterId: auth.uid,
        })
      } else {
        const hide = !comment.hidden
        // A market creator's hide collapses the comment on their market and
        // goes no further. Only an admin or moderator hides or restores the
        // comment's post on Yap as well.
        const onYap = linked && (isAdmin || isMod) ? linked : null
        await pg.tx(async (tx) => {
          if (onYap) await lockSocialThread(tx, onYap.id)
          await updateData(tx, 'contract_comments', 'comment_id', {
            comment_id: commentId,
            hidden: hide,
            hiddenTime: hide ? Date.now() : undefined,
            hiderId: auth.uid,
          })
          if (onYap)
            await tx.none(
              'update social_posts set hidden_time=case when $2 then clock_timestamp() else null end where id=$1',
              [onYap.id, hide]
            )
        })
      }

      await revalidateContractStaticProps(contract)
      return {
        result: { success: true },
        continue: async () => {
          await trackPublicEvent(
            auth.uid,
            action === 'delete' ? 'delete_comment' : 'hide_comment',
            {
              contractId,
              commentId,
              [action === 'delete' ? 'deleted' : 'hidden']:
                action === 'delete' ? !comment.deleted : !comment.hidden,
              userId: auth.uid,
            }
          )
        },
      }
    }
  )
