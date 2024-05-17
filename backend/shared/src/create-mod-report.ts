import { createSupabaseClient } from './supabase/init'
import type { ContractComment } from 'common/src/comment'
import { getContract } from './utils'

export const insertModReport = async (comment: ContractComment) => {
  const {
    id: comment_id,
    contractId: contract_id,
    userId: user_id,
    contractSlug: contract_slug,
    contractQuestion: contract_question,
    content: content,
  } = comment

  const contract = await getContract(contract_id)
  const creator_username = contract?.creatorUsername

  if (!creator_username) {
    console.error('Creator username not found for contract:', contract_id)
    return
  }

  const db = createSupabaseClient()

  const reportData = {
    created_time: new Date().toISOString(),
    comment_id: comment_id,
    contract_id: contract_id,
    user_id: user_id,
    status: 'new' as const,
    contract_slug: contract_slug,
    contract_question: contract_question,
    content: content,
    creator_username: creator_username,
  }

  const { data, error } = await db.from('mod_reports').insert(reportData)

  if (error) {
    console.error('Error inserting mod report:', error)
    return
  }

  console.log('Mod report created successfully:', data)
}
