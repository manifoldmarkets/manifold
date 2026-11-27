import { processUserMembershipGrants } from 'shared/membership-grants'
import { membershipGrantStartsDisabled } from 'shared/membership-grant-config'
import { getLocalEnv } from 'shared/init-admin'
import { relayMembershipBroadcast } from 'shared/relay-membership-broadcast'
import type { SupabaseDirectClientTimeout } from 'shared/supabase/init'
import { runScript } from './run-script'
import { parseArgs } from 'node:util'

export async function endActiveMembershipGrants(
  pg: SupabaseDirectClientTimeout,
  apply = false
) {
  if (apply && !(await membershipGrantStartsDisabled(pg)))
    throw new Error('--apply requires MEMBERSHIP_GRANTS status to be false')

  const active = await pg.manyOrNone<{
    user_id: string
    id: string
    ends_time: string
    db_time: string
  }>(
    `select user_id, id::text, ends_time, now() as db_time
     from membership_grants where status = 'active' order by user_id`
  )
  console.log(`Found ${active.length} active membership grants.`)
  if (!apply) {
    for (const grant of active) {
      const remainingMs = Math.max(
        0,
        Date.parse(grant.ends_time) - Date.parse(grant.db_time)
      )
      console.log(
        `Grant ${grant.id} for ${grant.user_id} would re-bank ${remainingMs} ms.`
      )
    }
    return
  }

  const env = getLocalEnv()
  const relays: Promise<void>[] = []
  try {
    for (const { user_id } of active)
      await processUserMembershipGrants(pg, user_id, 'end-active', (userId) => {
        relays.push(relayMembershipBroadcast(userId, env))
      })
  } finally {
    await Promise.all(relays)
  }

  const remaining = await pg.one<{ count: number }>(
    "select count(*)::int from membership_grants where status = 'active'"
  )
  if (remaining.count)
    throw new Error(`${remaining.count} active grants remain`)
  console.log('All active membership grants have ended.')
}

if (require.main === module) {
  const {
    values: { apply },
  } = parseArgs({
    args: process.argv.slice(2),
    options: { apply: { type: 'boolean', default: false } },
  })

  runScript(({ pg }) => endActiveMembershipGrants(pg, apply))
}
