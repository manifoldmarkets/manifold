import { SupabaseDirectClient } from 'shared/supabase/init'

export async function getRecentContractLikes(
  pg: SupabaseDirectClient,
  since: number
) {
  const counts = await pg.func('recently_liked_contract_counts', since)
  return Object.fromEntries(counts.map((c: any) => [c.contract_id, c.n]))
}
