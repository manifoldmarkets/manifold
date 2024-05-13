import { createSupabaseClient } from './supabase/init'
import type { ContractComment } from 'common/src/comment'

export const insertModReport = async (comment: ContractComment) => {
  const { id: comment_id, contractId: contract_id, userId: user_id } = comment

  const db = createSupabaseClient()

  const reportData = {
    created_time: new Date().toISOString(),
    comment_id: comment_id,
    contract_id: contract_id,
    user_id: user_id,
    status: 'new' as const,
  }

  const { data, error } = await db.from('mod_reports').insert(reportData)

  if (error) {
    console.error('Error inserting mod report:', error)
    return
  }

  console.log('Mod report created successfully:', data)
}
