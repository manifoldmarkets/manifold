import { ContractComment } from 'common/comment'
import { SupabaseClient, run } from './utils'

export async function getAllComments(
  db: SupabaseClient,
  contractId: string,
  maxCount: number
) {
  const { data: comments } = await run(
    db
      .from('contract_comments')
      .select('data')
      .eq('contract_id', contractId)
      .order('created_time', { ascending: false } as any)
      .limit(maxCount)
  )
  return comments.map((comment) => comment.data as ContractComment)
}
