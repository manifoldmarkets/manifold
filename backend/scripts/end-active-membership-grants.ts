import { processUserMembershipGrants } from 'shared/membership-grants'
import { membershipGrantStartsDisabled } from 'shared/membership-grant-config'
import { runScript } from './run-script'
import { parseArgs } from 'node:util'

if (require.main === module) {
  const {
    values: { apply },
  } = parseArgs({
    args: process.argv.slice(2),
    options: { apply: { type: 'boolean', default: false } },
  })

  if (apply && !membershipGrantStartsDisabled())
    throw new Error('--apply requires MEMBERSHIP_GRANT_STARTS_DISABLED=true')

  runScript(async ({ pg }) => {
    const active = await pg.manyOrNone<{
      user_id: string
      id: string
      ends_time: string
    }>(
      "select user_id, id::text, ends_time from membership_grants where status = 'active' order by user_id"
    )
    console.log(`Found ${active.length} active membership grants.`)
    if (!apply) {
      const now = Date.now()
      for (const grant of active) {
        const remainingMs = Math.max(0, Date.parse(grant.ends_time) - now)
        console.log(
          `Grant ${grant.id} for ${grant.user_id} would re-bank ${remainingMs} ms.`
        )
      }
      return
    }

    for (const { user_id } of active)
      await processUserMembershipGrants(pg, user_id, 'end-active')

    const remaining = await pg.one<{ count: number }>(
      "select count(*)::int from membership_grants where status = 'active'"
    )
    if (remaining.count)
      throw new Error(`${remaining.count} active grants remain`)
    console.log('All active membership grants have ended.')
  })
}
