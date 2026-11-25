import { createSupabaseDirectClient } from 'shared/supabase/init'
import { processUserMembershipGrants } from 'shared/membership-grants'
import { log } from 'shared/utils'

export async function processMembershipGrants() {
  const pg = createSupabaseDirectClient()
  const users = await pg.manyOrNone<{ user_id: string }>(`
    select user_id from membership_grants where status = 'active' and ends_time <= now()
    union
    select b.user_id from membership_grants b where b.status = 'banked'
    and not exists (select 1 from membership_grants a where a.user_id = b.user_id and a.status = 'active')
  `)
  let started = 0
  let ended = 0
  let failed = 0
  for (const { user_id } of users) {
    try {
      const change = await processUserMembershipGrants(pg, user_id)
      if (change.started) started++
      if (change.ended) ended++
    } catch (err) {
      failed++
      log.error('Failed to process membership grants', {
        userId: user_id,
        error: String(err),
      })
    }
  }
  log(
    `Membership grants: checked ${users.length} users, started ${started}, ended ${ended}, failed ${failed}`
  )
}
