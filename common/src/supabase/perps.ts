import { SupabaseClient, run } from 'common/supabase/utils'

export async function getPerpPositionCount(
  contractId: string,
  db: SupabaseClient
) {
  const { count } = await run(
    db
      .from('contract_perp_positions')
      .select('*', { head: true, count: 'exact' })
      .eq('contract_id', contractId)
  )
  return count
}

// Matches the get-perp-events WHERE clause (funding and null-user summary
// rows are never displayed), so the tab title count equals the rows the
// Trades tab can actually show.
export async function getPerpTradeCount(
  contractId: string,
  db: SupabaseClient
) {
  const { count } = await run(
    db
      .from('contract_perp_events')
      .select('*', { head: true, count: 'exact' })
      .eq('contract_id', contractId)
      .neq('event_type', 'funding')
      .not('user_id', 'is', null)
  )
  return count
}
