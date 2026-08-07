import { groupBy, sortBy } from 'lodash'
import { runScript } from 'run-script'

import { PerpContract } from 'common/contract'
import { User } from 'common/user'
import { payBettingStreak } from 'shared/betting-streak-bonus'
import { getUser } from 'shared/utils'

// Pays the daily betting-streak bonuses that the perp trade path silently
// dropped between the perps launch (2026-08-06 UTC) and the deploy of the
// perp-streak deadlock fix: advancePerpBettingStreak held the per-user
// betsQueue lock while payBettingStreak -> runTxnFromBank re-entered the same
// queue, so the bonus txn timed out and rolled back after the streak
// increment had already committed. Result: the streak day was consumed, no
// bonus, no notification.
//
// Affected (user, Pacific-day) pairs: a perp open/close was the user's first
// qualifying action of the Pacific day and no BETTING_STREAK_BONUS txn exists
// for that day. The streak the user held on each day is reconstructed by
// walking backward from the user's current currentBettingStreak across all
// increment days (paid and unpaid) in the window; recorded streak values on
// paid days act as sanity anchors and any mismatch skips the user with a
// warning instead of paying a possibly-wrong amount.
//
// Caveats:
// - Trades made with an API key can't be distinguished in
//   contract_perp_events. The live path deliberately withholds the bonus for
//   API trades, so an API-only trader in this list would receive a bonus the
//   live path would not have paid. Review the dry-run output before paying.
// - Safe to re-run: a pair is skipped when a BETTING_STREAK_BONUS txn already
//   records the streak value assigned to that day (streaks strictly increase,
//   so the value uniquely identifies the increment).
//
// Usage:
//   ts-node backfill-perp-streak-bonuses.ts        # dry run, prints the plan
//   ts-node backfill-perp-streak-bonuses.ts --pay  # actually pays
runScript(async ({ pg }) => {
  const pay = process.argv.includes('--pay')
  const WINDOW_START = '2026-08-06 00:00:00Z'

  const affected = await pg.manyOrNone<{
    user_id: string
    pt_day: string
    first_perp_contract: string
  }>(
    `with perp_first as (
      select user_id,
        (ts at time zone 'America/Los_Angeles')::date as pt_day,
        min(ts) as first_perp
      from contract_perp_events
      where event_type in ('open', 'close') and ts >= $1
      group by 1, 2
    ),
    first_bet as (
      select user_id,
        (created_time at time zone 'America/Los_Angeles')::date as pt_day,
        min(created_time) as first_bet
      from contract_bets
      where created_time >= $1
        and coalesce((data->>'isRedemption')::boolean, false) = false
        and user_id in (select distinct user_id from contract_perp_events)
      group by 1, 2
    ),
    bonus as (
      select to_id as user_id,
        (created_time at time zone 'America/Los_Angeles')::date as pt_day
      from txns
      where category = 'BETTING_STREAK_BONUS' and created_time >= $1
      group by 1, 2
    )
    select p.user_id, p.pt_day::text as pt_day,
      (select e.contract_id from contract_perp_events e
        where e.user_id = p.user_id and e.ts = p.first_perp
        limit 1) as first_perp_contract
    from perp_first p
    left join first_bet fb on fb.user_id = p.user_id and fb.pt_day = p.pt_day
    left join bonus b on b.user_id = p.user_id and b.pt_day = p.pt_day
    where (fb.first_bet is null or p.first_perp < fb.first_bet)
      and b.user_id is null
    order by p.user_id, p.pt_day`,
    [WINDOW_START]
  )
  console.log(`${affected.length} unpaid (user, day) pairs found`)

  const paidRows = await pg.manyOrNone<{
    user_id: string
    pt_day: string
    streak: number
  }>(
    `select to_id as user_id,
      ((created_time at time zone 'America/Los_Angeles')::date)::text as pt_day,
      (data->'data'->>'currentBettingStreak')::int as streak
    from txns
    where category = 'BETTING_STREAK_BONUS' and created_time >= $1`,
    [WINDOW_START]
  )
  const paidByUser = groupBy(paidRows, 'user_id')

  const byUser = groupBy(affected, 'user_id')
  let planned = 0
  let paidCount = 0
  let totalPaid = 0

  for (const userId of Object.keys(byUser)) {
    const user = await getUser(userId)
    if (!user) {
      console.warn(`SKIP ${userId}: user not found`)
      continue
    }

    // Every increment day in the window, newest first, gets a streak value
    // counting down from the user's current streak.
    const unpaidDays = byUser[userId].map((r) => r.pt_day)
    const paidDays = (paidByUser[userId] ?? []).map((r) => r.pt_day)
    const incrementDays = sortBy([...unpaidDays, ...paidDays]).reverse()

    let streak = user.currentBettingStreak ?? 0
    const assigned: { [day: string]: number } = {}
    for (const day of incrementDays) {
      assigned[day] = streak
      streak--
    }

    // Sanity: recorded streaks on paid days must match the walk-back. A
    // mismatch means an increment day we can't see (e.g. an API bet day or a
    // streak reset inside the window) — don't guess, skip the user.
    const mismatch = (paidByUser[userId] ?? []).find(
      (r) => assigned[r.pt_day] !== r.streak
    )
    if (mismatch) {
      console.warn(
        `SKIP ${user.username}: paid day ${mismatch.pt_day} recorded streak ` +
          `${mismatch.streak} but walk-back assigned ${
            assigned[mismatch.pt_day]
          }`
      )
      continue
    }

    for (const row of byUser[userId]) {
      const dayStreak = assigned[row.pt_day]
      if (!Number.isFinite(dayStreak) || dayStreak <= 0) {
        console.warn(
          `SKIP ${user.username} ${row.pt_day}: implausible streak ${dayStreak}`
        )
        continue
      }

      // Idempotency: a bonus txn recording this streak value means this
      // increment was already paid (possibly by a prior run of this script).
      const already = await pg.oneOrNone(
        `select 1 from txns
        where to_id = $1 and category = 'BETTING_STREAK_BONUS'
          and (data->'data'->>'currentBettingStreak')::int = $2`,
        [userId, dayStreak]
      )
      if (already) {
        console.log(
          `SKIP ${user.username} ${row.pt_day}: streak ${dayStreak} already paid`
        )
        continue
      }

      const contract = (
        await pg.oneOrNone<{ data: PerpContract }>(
          `select data from contracts where id = $1`,
          [row.first_perp_contract]
        )
      )?.data
      if (!contract) {
        console.warn(
          `SKIP ${user.username} ${row.pt_day}: contract ${row.first_perp_contract} not found`
        )
        continue
      }

      planned++
      console.log(
        `${pay ? 'PAY' : 'PLAN'} ${user.username} day=${row.pt_day} ` +
          `streak=${dayStreak} via ${contract.slug}`
      )
      if (!pay) continue

      // payBettingStreak expects the PRE-increment user and recomputes the
      // amount, multiplier, txn, and notification exactly like the live path.
      const oldUser: User = {
        ...user,
        currentBettingStreak: dayStreak - 1,
      }
      await payBettingStreak(
        oldUser,
        contract,
        `/${contract.creatorUsername}/${contract.slug}`,
        contract.id
      )
      paidCount++
      const paidAmount = await pg.oneOrNone<{ amount: number }>(
        `select amount from txns
        where to_id = $1 and category = 'BETTING_STREAK_BONUS'
          and (data->'data'->>'currentBettingStreak')::int = $2
        order by created_time desc limit 1`,
        [userId, dayStreak]
      )
      if (paidAmount && Number.isFinite(paidAmount.amount)) {
        totalPaid += Number(paidAmount.amount)
      }
    }
  }

  console.log(
    pay
      ? `Paid ${paidCount} bonuses, ${totalPaid} M$ total`
      : `Dry run: ${planned} bonuses would be paid. Re-run with --pay.`
  )
})
