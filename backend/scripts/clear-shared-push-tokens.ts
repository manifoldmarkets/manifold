// One-time cleanup for the multi-account push-token leak.
//
// Background: a device's Expo push token used to be left on every account that
// had ever logged in on that device (logout never cleared it, and login never
// reclaimed it). As a result a single device token ends up registered on many
// private_users rows, and prize/charity push notifications get delivered to the
// device for accounts the user has since logged out of.
//
// The code fix (set-push-token reclaim + clear-on-logout) prevents NEW leaks,
// but it does not clean up tokens that are already shared. This script does:
// for every device token held by more than one account, it keeps the token on
// the single most-recently-active account and removes it from all the others.
//
// Any account that loses its token here simply re-registers (on exactly one
// account, thanks to the new code) the next time the user opens the app, so this
// is self-healing and safe to re-run.
//
// Usage (from backend/scripts):
//   Dry run (default, no writes):  npx ts-node clear-shared-push-tokens.ts
//   Apply the changes:             npx ts-node clear-shared-push-tokens.ts --commit
//
// Run against prod with prod creds, e.g.:
//   GOOGLE_APPLICATION_CREDENTIALS=$GOOGLE_APPLICATION_CREDENTIALS_PROD \
//     firebase use prod && npx ts-node clear-shared-push-tokens.ts --commit

import { runScript } from './run-script'

const COMMIT = process.argv.includes('--commit')

// Show only the tail of a token in logs so we never dump full push tokens.
const maskToken = (token: string) =>
  token.length <= 8 ? token : `…${token.slice(-6)}`

runScript(async ({ pg }) => {
  // All accounts that share a push token with at least one other account, plus
  // a recency signal (last bet time, falling back to account creation time).
  const rows = await pg.manyOrNone<{
    push_token: string
    id: string
    username: string
    last_active: number
  }>(
    `with shared as (
       select data->>'pushToken' as push_token
       from private_users
       where data->>'pushToken' is not null
         and data->>'pushToken' <> ''
       group by 1
       having count(*) > 1
     )
     select
       pu.data->>'pushToken' as push_token,
       pu.id,
       u.username,
       coalesce(
         (u.data->>'lastBetTime')::numeric,
         extract(epoch from u.created_time) * 1000
       ) as last_active
     from private_users pu
     join users u on u.id = pu.id
     where pu.data->>'pushToken' in (select push_token from shared)
     order by pu.data->>'pushToken', last_active desc`
  )

  // Group accounts by device token.
  const byToken = new Map<string, typeof rows>()
  for (const row of rows) {
    const group = byToken.get(row.push_token) ?? []
    group.push(row)
    byToken.set(row.push_token, group)
  }

  const idsToClear: string[] = []

  console.log(
    `Found ${byToken.size} device tokens shared across ${rows.length} accounts.\n`
  )

  for (const [token, group] of byToken) {
    // Rows are ordered by last_active desc, so the first is the keeper.
    const [keeper, ...losers] = group
    console.log(`token ${maskToken(token)} (${group.length} accounts)`)
    console.log(`  keep   ${keeper.username} (${keeper.id})`)
    for (const loser of losers) {
      console.log(`  clear  ${loser.username} (${loser.id})`)
      idsToClear.push(loser.id)
    }
  }

  console.log(
    `\n${idsToClear.length} accounts would have their push token cleared.`
  )

  if (!COMMIT) {
    console.log('\nDry run — no changes written. Re-run with --commit to apply.')
    return
  }

  await pg.none(
    `update private_users set data = data - 'pushToken' where id = any($1)`,
    [idsToClear]
  )

  // Verify no token is shared across multiple accounts anymore.
  const remaining = await pg.one<{ count: number }>(
    `select count(*)::int as count from (
       select data->>'pushToken' as tok
       from private_users
       where data->>'pushToken' is not null and data->>'pushToken' <> ''
       group by 1
       having count(*) > 1
     ) t`
  )

  console.log(
    `\nDone. Cleared ${idsToClear.length} tokens. ` +
      `Tokens still shared by multiple accounts: ${remaining.count}.`
  )
})
