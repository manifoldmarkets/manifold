import { convertContractComment } from 'common/supabase/comments'
import { SupabaseClient } from 'common/supabase/utils'

export async function getComment(db: SupabaseClient, commentId: string) {
  const res = await db
    .from('contract_comments')
    .select()
    .eq('comment_id', commentId)
    .single()

  if (res.error) {
    return null
  }

  return convertContractComment(res.data)
}
