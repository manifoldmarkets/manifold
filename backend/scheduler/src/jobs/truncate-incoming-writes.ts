import { createSupabaseDirectClient } from 'shared/supabase/init'

export async function truncateIncomingWrites() {
  const pg = createSupabaseDirectClient()
  await pg.none(`truncate table incoming_writes`)
}
