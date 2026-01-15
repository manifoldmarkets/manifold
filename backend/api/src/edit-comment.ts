import { validateComment } from 'api/create-comment'
import { APIError, type APIHandler } from 'api/helpers/endpoint'
import { onlyUsersWhoCanPerformAction } from 'api/helpers/rate-limit'
import { contractPath } from 'common/contract'
import { isAdminId } from 'common/envs/constants'
import { getComment } from 'shared/supabase/contract-comments'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateData } from 'shared/supabase/utils'
import { revalidateStaticProps } from 'shared/utils'

export const editComment: APIHandler<'edit-comment'> =
  onlyUsersWhoCanPerformAction('comment', async (props, auth) => {
    const { commentId, contractId, content, html, markdown } = props
    const {
      you: editor,
      contract,
      contentJson,
    } = await validateComment(contractId, auth.uid, content, html, markdown)

    const pg = createSupabaseDirectClient()
    const comment = await getComment(pg, commentId)

    if (editor.id !== comment.userId && !isAdminId(editor.id))
      throw new APIError(403, 'User is not the creator of the comment.')

    await updateData(pg, 'contract_comments', 'comment_id', {
      comment_id: commentId,
      content: contentJson,
      editedTime: Date.now(),
    })
    await pg.none(
      `
      insert into contract_comment_edits (contract_id, editor_id, comment_id, data)
      values ($1, $2, $3, $4)
      `,
      [contract.id, editor.id, comment.id, comment]
    )
    await revalidateStaticProps(contractPath(contract))

    return { success: true }
  })
