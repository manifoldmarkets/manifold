import { processUserMembershipGrants } from 'shared/membership-grants'
import { runScript } from './run-script'
import { parseArgs } from 'node:util'

if (require.main === module) {
  const {
    values: { apply },
  } = parseArgs({
    args: process.argv.slice(2),
    options: { apply: { type: 'boolean', default: false } },
  })

  runScript(async ({ pg }) => {
    const active = await pg.manyOrNone<{ user_id: string }>(
      "select user_id from membership_grants where status = 'active' order by user_id"
    )
    console.log(`Found ${active.length} active membership grants.`)
    if (!apply) return

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
