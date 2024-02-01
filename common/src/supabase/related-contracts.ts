import { SupabaseClient } from 'common/supabase/utils'
import { Contract } from 'common/contract'

export async function getRelatedContracts(
  contract: Contract,
  count: number,
  db: SupabaseClient
) {
  const { data } = await db.rpc('close_contract_embeddings_1', {
    input_contract_id: contract.id,
    match_count: count,
    similarity_threshold: 0.7,
    politics_only: true,
  })
  return (data ?? []).map((c) => c.data as Contract)
}
