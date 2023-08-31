import { ContractComment } from 'common/comment'
import { SupabaseClient, run } from './utils'

export async function getRecentTopLevelCommentsAndReplies(
  db: SupabaseClient,
  contractId: string,
  approximateTotalComments: number
) {
  const { data: parents } = await run(
    db
      .from('contract_comments')
      .select('data')
      .eq('contract_id', contractId)
      .is('data->>replyToCommentId', null)
      .order('created_time', { ascending: false } as any)
      .limit(approximateTotalComments)
  )
  const { data: children } = await run(
    db
      .from('contract_comments')
      .select('data')
      .eq('contract_id', contractId)
      .not('data->>replyToCommentId', 'is', null)
      .in(
        'data->>replyToCommentId',
        parents.map((p) => (p.data as ContractComment).id)
      )
      .order('created_time', { ascending: false } as any)
  )

  const targetComments = [] as ContractComment[]
  // Add just enough parents and respective children to surpass the approximate target
  for (const parent of parents) {
    const parentComment = parent.data as ContractComment
    const childrenComments = children
      .filter(
        (c) => (c.data as ContractComment).replyToCommentId === parentComment.id
      )
      .map((c) => c.data as ContractComment)
    targetComments.push(parentComment)
    targetComments.push(...childrenComments)
    if (targetComments.length >= approximateTotalComments) break
  }

  return targetComments
}
