// One-shot cleanup for PR #4139 (verification optional). Before it, a failed,
// suspected or expired iDenfy session set bonusEligibility = 'ineligible'. Now a
// failed check only blocks prize drawings, and approval no longer clears
// 'ineligible' (it's reserved for admin and superban bonus blocks), so users
// who are 'ineligible' only because of an old iDenfy result could never earn
// default bonuses again. This returns them to the default (unset) state and
// pins prizeEligibility = 'ineligible' where it isn't set, matching what a
// failed check does today.
//
// Scope: bonusEligibility = 'ineligible', at least one denied/suspected iDenfy
// session, not banned from posting (legacy flag), and no active ban other than
// a modAlert — superbanned accounts keep their block.
//
// Dry run by default. Set DRY_RUN=false to apply.

import { runScript } from 'run-script'
import { updateUser } from 'shared/supabase/users'
import { FieldVal } from 'shared/supabase/utils'

const DRY_RUN = process.env.DRY_RUN !== 'false'

if (require.main === module) {
  runScript(async ({ pg }) => {
    const users = await pg.manyOrNone<{
      id: string
      username: string
      prize_eligibility: string | null
      latest_status: string | null
    }>(
      `select u.id, u.username,
              u.data->>'prizeEligibility' as prize_eligibility,
              (select status from idenfy_verifications iv
                where iv.user_id = u.id
                order by created_time desc limit 1) as latest_status
       from users u
       where u.data->>'bonusEligibility' = 'ineligible'
         and coalesce(u.data->>'isBannedFromPosting', 'false') <> 'true'
         and exists (
           select 1 from idenfy_verifications iv
           where iv.user_id = u.id and iv.status in ('denied', 'suspected')
         )
         and not exists (
           select 1 from user_bans b
           where b.user_id = u.id
             and b.ended_at is null
             and b.ban_type <> 'modAlert'
         )
       order by u.created_time`
    )

    console.log(
      `${DRY_RUN ? '[dry-run] ' : ''}${
        users.length
      } users to return to default bonus eligibility`
    )
    for (const u of users) {
      console.log(
        `${DRY_RUN ? '[dry-run] ' : ''}${u.username} (${u.id}) latest iDenfy: ${
          u.latest_status
        }, prizeEligibility: ${u.prize_eligibility ?? 'unset → ineligible'}`
      )
      if (DRY_RUN) continue
      await updateUser(pg, u.id, {
        bonusEligibility: FieldVal.delete() as any,
        ...(u.prize_eligibility ? {} : { prizeEligibility: 'ineligible' }),
      })
    }
    if (DRY_RUN) console.log('DRY_RUN was on — nothing was written.')
  })
}
