import { validateComment } from 'api/create-comment'
import { APIError, type APIHandler } from 'api/helpers/endpoint'
import { onlyUsersWhoCanPerformAction } from 'api/helpers/rate-limit'
import { JSONContent } from '@tiptap/core'
import { ContractComment } from 'common/comment'
import { Contract, contractPath } from 'common/contract'
import { isAdminId } from 'common/envs/constants'
import { getComment } from 'shared/supabase/contract-comments'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { updateData } from 'shared/supabase/utils'
import { revalidateStaticProps } from 'shared/utils'
import { syncSocialPostFromComment } from 'shared/social-discussion'
import { lockSocialThread } from 'shared/social-posts'

export const editComment: APIHandler<'edit-comment'> =
  onlyUsersWhoCanPerformAction('comment', async (props, auth) => {
    const { commentId, contractId, content, html, markdown } = props
    const {
      you: editor,
      contract,
      contentJson,
    } = await validateComment(contractId, auth.uid, content, html, markdown)

    const pg = createSupabaseDirectClient()
    await pg.tx(async (tx) => {
      const comment = await getComment(tx, commentId, true)
      if (comment.contractId !== contractId)
        throw new APIError(400, 'Comment does not belong to this market')

      if (editor.id !== comment.userId && !isAdminId(editor.id))
        throw new APIError(403, 'User is not the creator of the comment.')

      // An edit made on the market follows the market's rules and stores the
      // document as written. If the comment is also on Yap, its copy there is
      // brought up to date in the same transaction, under the thread lock.
      const linked = await tx.oneOrNone<{ id: string }>(
        'select id from social_posts where market_comment_id=$1 and deleted_time is null',
        [commentId]
      )
      if (linked) await lockSocialThread(tx, linked.id)
      await editCommentContentInternal(
        tx,
        contract,
        comment,
        editor.id,
        contentJson
      )
      if (linked) await syncSocialPostFromComment(tx, linked.id, contentJson)
    })
    await revalidateStaticProps(contractPath(contract))

    return { success: true }
  })

// Replaces a comment's content and logs the previous version. Callers
// revalidate the market page, after any enclosing transaction commits.
export const editCommentContentInternal = async (
  pg: SupabaseDirectClient,
  contract: Contract,
  comment: ContractComment,
  editorId: string,
  content: JSONContent
) => {
  await updateData(pg, 'contract_comments', 'comment_id', {
    comment_id: comment.id,
    content,
    editedTime: Date.now(),
  })
  await pg.none(
    `
      insert into contract_comment_edits (contract_id, editor_id, comment_id, data)
      values ($1, $2, $3, $4)
      `,
    [contract.id, editorId, comment.id, comment]
  )
}
