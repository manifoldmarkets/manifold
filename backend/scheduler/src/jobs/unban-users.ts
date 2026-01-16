import { createSupabaseDirectClient } from 'shared/supabase/init'

export async function unbanUsers() {
  const pg = createSupabaseDirectClient()

  // End all temporary bans that have expired
  // The end_time column indicates when the ban should automatically expire
  // We set ended_by to 'system' and ended_at to now() for expired bans
  const result = await pg.result(
    `UPDATE user_bans
     SET ended_by = 'system', ended_at = now()
     WHERE ended_at IS NULL
       AND end_time IS NOT NULL
       AND end_time <= now()
     RETURNING id, user_id, ban_type`
  )

  const expiredBans = result.rows as { id: number; user_id: string; ban_type: string }[]

  if (expiredBans.length > 0) {
    console.log(`Auto-expired ${expiredBans.length} temporary bans:`)
    for (const ban of expiredBans) {
      console.log(`  - User ${ban.user_id}: ${ban.ban_type} ban expired`)
    }
  } else {
    console.log('No temporary bans to expire')
  }
}
