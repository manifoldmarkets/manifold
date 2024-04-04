import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'

export async function cleanOldTombstones() {
  const pg = createSupabaseDirectClient()
  const count = await pg.result(
    "delete from tombstones where fs_deleted_at < now() - interval '1 week'",
    [],
    (r) => r.rowCount
  )
  log(`Deleted ${count} old tombstones.`)
}
