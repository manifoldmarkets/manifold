import { runScript } from 'run-script'
import {
  STARTING_BALANCE,
  VERIFIED_SIGNUP_BONUS_DESCRIPTION,
} from 'common/economy'
import { runTxnFromBank } from 'shared/txn/run-txn'
import { updateUser } from 'shared/supabase/users'

// Pays the identity-verification signup bonus to users the iDenfy callback
// skipped: its dedupe matched on category = 'SIGNUP_BONUS' alone, which
// collides with the next-day signup bonus (same category), so anyone whose
// next-day bonus landed before iDenfy approval was never paid. The callback
// now matches on VERIFIED_SIGNUP_BONUS_DESCRIPTION as well; this backfills
// the users skipped before that fix.
//
// Dry-runs by default (lists the cohort, pays nothing). Pass --commit to pay.

const commit = process.argv.includes('--commit')

runScript(async ({ pg }) => {
  const users = await pg.manyOrNone<{
    user_id: string
    username: string
    approved_time: string
  }>(
    `select
        v.user_id,
        u.username,
        min(v.updated_time)::text as approved_time
     from idenfy_verifications v
     join users u on u.id = v.user_id
     where v.status = 'approved'
       and coalesce((u.data->>'signupBonusPaid')::numeric, 0) < $2
       and not exists (
         select 1
         from txns t
         where t.to_id = v.user_id
           and t.category = 'SIGNUP_BONUS'
           and t.data->>'description' = $1
       )
     group by v.user_id, u.id
     order by approved_time`,
    [VERIFIED_SIGNUP_BONUS_DESCRIPTION, STARTING_BALANCE]
  )

  console.log(`${users.length} users missing the verification signup bonus:`)
  for (const u of users) {
    console.log(`  ${u.user_id} (${u.username}) approved ${u.approved_time}`)
  }
  console.log(`Total to pay: ${users.length * STARTING_BALANCE} M$`)

  if (!commit) {
    console.log('Dry run only — rerun with --commit to pay.')
    return
  }

  let paid = 0
  for (const u of users) {
    try {
      const result = await pg.tx(async (tx) => {
        // Re-check inside the transaction so reruns of this script (or a
        // concurrent webhook retry) can't double-pay.
        const existing = await tx.oneOrNone(
          `select 1 from txns
           where to_id = $1
             and category = 'SIGNUP_BONUS'
             and data->>'description' = $2`,
          [u.user_id, VERIFIED_SIGNUP_BONUS_DESCRIPTION]
        )
        if (existing) return 'skipped'

        await runTxnFromBank(tx, {
          fromType: 'BANK',
          toId: u.user_id,
          toType: 'USER',
          amount: STARTING_BALANCE,
          token: 'M$',
          category: 'SIGNUP_BONUS',
          description: VERIFIED_SIGNUP_BONUS_DESCRIPTION,
          data: { backfill: true },
        })
        await updateUser(tx, u.user_id, { signupBonusPaid: STARTING_BALANCE })
        return 'paid'
      })

      if (result === 'paid') {
        paid++
        console.log(`Paid ${STARTING_BALANCE} to ${u.username} (${u.user_id})`)
      } else {
        console.log(`Skipped ${u.username} (${u.user_id}) — already paid`)
      }
    } catch (error) {
      console.error(
        `Failed for ${u.username} (${u.user_id}): ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
  }
  console.log(`Done. Paid ${paid}/${users.length} users.`)
})
