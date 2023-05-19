import { SupabaseClient } from '@supabase/supabase-js'
import { Contract } from 'common/contract'

export async function getRelatedContracts(
  contract: Contract,
  count = 10,
  db: SupabaseClient,
  isAdmin?: boolean
) {
  const { data } = await db.rpc('closest_contract_embeddings', {
    input_contract_id: contract.id,
    match_count: count,
    similarity_threshold: 0.7,
    is_admin: !!isAdmin,
  })
  const contracts = (data ?? []).map((c) => (c as any).data)
  return contracts
}
