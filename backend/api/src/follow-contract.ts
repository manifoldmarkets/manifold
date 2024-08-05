import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from './helpers/endpoint'

export const followContract: APIHandler<'follow-contract'> = async (
  { contractId, follow },
  auth
) => {
  const pg = createSupabaseDirectClient()

  if (follow) {
    await pg.none(
      `insert into contract_follows (contract_id, follow_id)
       values ($1, $2)
       on conflict (contract_id, follow_id) do nothing`,
      [contractId, auth.uid]
    )
  } else {
    await pg.none(
      `delete from contract_follows
       where contract_id = $1 and follow_id = $2`,
      [contractId, auth.uid]
    )
  }

  return { success: true }
}
