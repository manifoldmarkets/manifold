import { SUPPORTER_TIERS, TIER_ORDER } from 'common/supporter-config'
import { membershipGrantToken } from 'shared/membership-grant-config'
import { activeSupporterAccessSql } from 'shared/supabase/entitlements'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { processUserMembershipGrants } from 'shared/membership-grants'
import { relayMembershipBroadcast } from 'shared/relay-membership-broadcast'
import { log } from 'shared/utils'

export async function processMembershipGrants() {
  const pg = createSupabaseDirectClient()
  const users = await pg.manyOrNone<{ user_id: string }>(
    `
    select user_id from membership_grants where status = 'active' and ends_time <= now()
    union
    select b.user_id from membership_grants b where b.status = 'banked'
    and not exists (select 1 from system_trading_status where token = $1 and not status)
    and not exists (select 1 from membership_grants a where a.user_id = b.user_id and a.status = 'active')
    and not exists (
      select 1 from user_entitlements e where e.user_id = b.user_id and e.entitlement_id = any($2)
        and (e.expires_time is null or e.metadata->>'membershipGrantId' is not null
          or (${activeSupporterAccessSql}
            and array_position($2::text[], e.entitlement_id) > array_position($3::text[], b.tier)))
    )
  `,
    [
      membershipGrantToken,
      TIER_ORDER.map((t) => SUPPORTER_TIERS[t].id),
      TIER_ORDER,
    ]
  )
  let started = 0
  let ended = 0
  let failed = 0
  for (const { user_id } of users) {
    try {
      const change = await processUserMembershipGrants(
        pg,
        user_id,
        'advance',
        relayMembershipBroadcast
      )
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
