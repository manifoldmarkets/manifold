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
import { commentToYapContent } from 'shared/social-discussion'
import { socialPostEditSchema } from 'common/social-post'

export const editComment: APIHandler<'edit-comment'> =
  onlyUsersWhoCanPerformAction('comment', async (props, auth, req) => {
    const { commentId, contractId, content, html, markdown } = props
    const {
      you: editor,
      contract,
      contentJson,
    } = await validateComment(contractId, auth.uid, content, html, markdown)

    const pg = createSupabaseDirectClient()
    const comment = await getComment(pg, commentId)
    if (comment.contractId !== contractId)
      throw new APIError(400, 'Comment does not belong to this market')

    if (editor.id !== comment.userId && !isAdminId(editor.id))
      throw new APIError(403, 'User is not the creator of the comment.')

    const linked = await pg.oneOrNone<{ id: string }>(
      'select id from social_posts where market_comment_id=$1',
      [commentId]
    )
    if (linked) {
      const marketIds = await pg.map(
        'select contract_id from social_post_markets where post_id=$1 order by position',
        [linked.id],
        (r) => r.contract_id as string
      )
      const draft = socialPostEditSchema.safeParse({
        ...commentToYapContent(contentJson),
        marketIds,
      })
      if (!draft.success)
        throw new APIError(
          400,
          'This shared comment must fit Yap’s text and image limits.'
        )
      const { editSocialPost } = await import('./social-posts')
      await editSocialPost({ id: linked.id, content: draft.data }, auth, req)
      return { success: true }
    }

    await editCommentContentInternal(
      pg,
      contract,
      comment,
      editor.id,
      contentJson
    )
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
