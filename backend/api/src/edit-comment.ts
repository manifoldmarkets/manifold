import { APIError, authEndpoint, validate } from 'api/helpers/endpoint'
import { z } from 'zod'
import { validateComment } from 'api/create-comment'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { run } from 'common/supabase/utils'
import { contentSchema } from 'common/api/zod-types'
import { isAdminId } from 'common/envs/constants'
import { getDomainForContract, revalidateStaticProps } from 'shared/utils'
import { contractPath } from 'common/contract'
import { getComment } from 'shared/supabase/contract_comments'
import { updateData } from 'shared/supabase/utils'

const editSchema = z
  .object({
    contractId: z.string(),
    commentId: z.string(),
    content: contentSchema.optional(),
    html: z.string().optional(),
    markdown: z.string().optional(),
  })
  .strict()
export const editcomment = authEndpoint(async (req, auth) => {
  const { commentId, contractId, content, html, markdown } = validate(
    editSchema,
    req.body
  )
  const {
    you: editor,
    contract,
    contentJson,
  } = await validateComment(contractId, auth.uid, content, html, markdown)

  const db = createSupabaseClient()
  const comment = await getComment(db, commentId)

  if (editor.id !== comment.userId && !isAdminId(editor.id))
    throw new APIError(403, 'User is not the creator of the comment.')

  const pg = createSupabaseDirectClient()
  await updateData(pg, 'contract_comments', 'comment_id', {
    comment_id: commentId,
    content: contentJson,
    editedTime: Date.now(),
  })

  await run(
    db.from('contract_comment_edits').insert({
      contract_id: contract.id,
      editor_id: editor.id,
      comment_id: comment.id,
      data: comment,
    })
  )
  await revalidateStaticProps(
    contractPath(contract),
    getDomainForContract(contract)
  )

  return { success: true }
})
