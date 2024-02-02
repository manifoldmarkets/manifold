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
    politics_only: false,
  })
  return (data ?? []).map((c) => c.data as Contract)
}

export async function getRelatedPoliticsContracts(
  contract: Contract,
  count: number,
  offset: number,
  db: SupabaseClient
) {
  const { data } = await db.rpc('close_politics_contract_embeddings', {
    input_contract_id: contract.id,
    match_count: count,
    start: offset,
  })
  return (data ?? []).map((c: any) => c.data as Contract)
}
