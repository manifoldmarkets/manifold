import { APIError, authEndpoint, validate } from 'api/helpers'
import * as admin from 'firebase-admin'
import { z } from 'zod'
import { contentSchema, validateComment } from 'api/create-comment'
import { Comment } from 'common/comment'
import { createSupabaseClient } from 'shared/supabase/init'
import { run } from 'common/supabase/utils'

const editSchema = z.object({
  contractId: z.string(),
  commentId: z.string(),
  content: contentSchema.optional(),
  html: z.string().optional(),
  markdown: z.string().optional(),
})
export const editcomment = authEndpoint(async (req, auth) => {
  const firestore = admin.firestore()
  const { commentId, contractId, content, html, markdown } = validate(
    editSchema,
    req.body
  )
  const {
    creator: editor,
    contract,
    contentJson,
  } = await validateComment(contractId, auth.uid, content, html, markdown)

  const ref = firestore
    .collection(`contracts/${contractId}/comments`)
    .doc(commentId)
  const refSnap = await ref.get()
  if (!refSnap.exists) throw new APIError(400, 'Comment does not exist.')
  const comment = refSnap.data() as Comment
  if (editor.id !== comment.userId)
    throw new APIError(400, 'User is not the creator of the comment.')

  await ref.update({
    content: contentJson,
    editedTime: Date.now(),
  })
  const db = createSupabaseClient()
  await run(
    db.from('contract_comment_edits').insert({
      contract_id: contract.id,
      editor_id: editor.id,
      comment_id: comment.id,
      data: comment,
    })
  )

  return { commentId: ref.id }
})
