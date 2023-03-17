import { run } from 'common/supabase/utils'
import { db } from './db'

export async function getAllComments(contractId: string, maxCount: number) {
  const { data: comments } = await run(
    db
      .from('contract_comments')
      .select('data')
      .eq('contract_id', contractId)
      .order('fs_updated_time', { ascending: false })
      .limit(maxCount)
  )
  return comments.map((comment) => comment.data)
}
