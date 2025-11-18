import { createSupabaseDirectClient } from 'shared/supabase/init'

export async function unbanUsers() {
  const pg = createSupabaseDirectClient()

  // Update users where unban_time has passed
  const unbannedUsers = await pg.map(
    `update users
     set data = data - 'isBannedFromPosting',
         unban_time = null
     where (data->>'isBannedFromPosting')::boolean = true
       and unban_time is not null
       and unban_time <= now()
     returning id, username`,
    [],
    (r) => ({ id: r.id, username: r.username })
  )

  console.log(`Unbanned ${unbannedUsers.length} users`)
}

