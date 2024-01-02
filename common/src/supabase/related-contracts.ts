import { SupabaseClient } from 'common/supabase/utils'
import { Contract } from 'common/contract'

export async function getRelatedContracts(
  contract: Contract,
  count = 10,
  db: SupabaseClient
) {
  const { data } = await db.rpc('close_contract_embeddings', {
    input_contract_id: contract.id,
    match_count: count,
    similarity_threshold: 0.7,
  })
  const contracts = (data ?? []).map((c) => c.data as Contract)
  return contracts
}
