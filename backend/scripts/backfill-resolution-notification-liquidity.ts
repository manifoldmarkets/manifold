// Corrects market-resolution notifications sent before Nov 2026 to people who
// had added liquidity: their userPayout counted what the liquidity paid back
// as trading winnings, so the notification showed a profit they hadn't made.
// Each one gets the liquidity's share moved from userPayout to
// userLiquidityPayout, as new notifications have it.
//
// Run after the API that writes userLiquidityPayout is deployed: notifications
// sent before that deploy and after this runs would stay wrong. Notifications
// that already have userLiquidityPayout are skipped, so it's safe to re-run.
// A notification that can't be paired with its payout for certain is listed
// as DOUBTFUL and left alone.
//
// Dry run (default), last 90 days:
//   yarn ts-node backfill-resolution-notification-liquidity.ts
// Another start date (UTC):
//   yarn ts-node backfill-resolution-notification-liquidity.ts --since=2026-01-01
// Apply:
//   yarn ts-node backfill-resolution-notification-liquidity.ts --apply

import { chunk, groupBy, sumBy, uniq } from 'lodash'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'
import { DAY_MS } from 'common/util/time'
import { runScript } from './run-script'
import {
  CLOCK_SKEW_MS,
  DoubtfulNotification,
  getNotificationFixes,
  MAX_NOTIFICATION_DELAY_MS,
  NotificationFix,
  ResolutionNotification,
  ResolutionPayout,
} from './resolution-notification-liquidity'

const DEFAULT_DAYS = 90
const USER_BATCH = 100
const UPDATE_BATCH = 500
// The house's liquidity isn't a person's, and it has more notifications than
// anyone to search.
const HOUSE_IDS = [HOUSE_LIQUIDITY_PROVIDER_ID, DEV_HOUSE_LIQUIDITY_PROVIDER_ID]

const parseArgs = () => {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const sinceArg = args.find((a) => a.startsWith('--since='))
  const since = sinceArg
    ? Date.parse(sinceArg.slice('--since='.length))
    : Date.now() - DEFAULT_DAYS * DAY_MS
  if (!Number.isFinite(since)) throw new Error(`Bad date: ${sinceArg}`)
  const unknown = args.filter((a) => a !== '--apply' && a !== sinceArg)
  if (unknown.length) throw new Error(`Unknown arguments: ${unknown.join(' ')}`)
  return { apply, since }
}

runScript(async ({ pg }) => {
  const { apply, since } = parseArgs()
  console.log(
    `${apply ? 'APPLY' : 'DRY RUN (no writes)'}: payouts since ${new Date(
      since
    ).toISOString()}`
  )

  // Who was paid anything for their liquidity, and on which markets: one pass
  // over the period.
  const pairs = await pg.manyOrNone<{ user_id: string; contract_id: string }>(
    `select distinct to_id as user_id, from_id as contract_id
     from txns
     where category = 'CONTRACT_RESOLUTION_PAYOUT'
       and created_time >= millis_to_ts($1)
       and (data->'data'->>'deposit')::numeric <> 0
       and to_id <> all($2)`,
    [since, HOUSE_IDS]
  )
  const contractsByUser = groupBy(pairs, (p) => p.user_id)
  const userIds = Object.keys(contractsByUser)
  console.log(
    `${pairs.length} user/market pairs with liquidity payouts, ${userIds.length} users`
  )

  const allFixes: NotificationFix[] = []
  const allDoubtful: DoubtfulNotification[] = []
  for (const users of chunk(userIds, USER_BATCH)) {
    const wanted = new Set(
      users.flatMap((u) =>
        contractsByUser[u].map((p) => `${u}|${p.contract_id}`)
      )
    )
    const contractIds = uniq(
      users.flatMap((u) => contractsByUser[u].map((p) => p.contract_id))
    )
    const isWanted = (userId: string, contractId: string) =>
      wanted.has(`${userId}|${contractId}`)

    // Every payout to them on those markets, including ones without a
    // deposit, so each notification finds its own resolution.
    const payouts = (
      await pg.map<ResolutionPayout>(
        `select id, to_id, from_id, data->'data'->>'answerId' as answer_id,
                ts_to_millis(created_time) as created_time,
                coalesce((data->'data'->>'deposit')::numeric, 0) as deposit
         from txns
         where category = 'CONTRACT_RESOLUTION_PAYOUT'
           and to_id = any($1) and from_id = any($2)
           and created_time >= millis_to_ts($3)`,
        [users, contractIds, since - MAX_NOTIFICATION_DELAY_MS],
        (r) => ({
          id: r.id,
          userId: r.to_id,
          contractId: r.from_id,
          answerId: r.answer_id ?? null,
          createdTime: Number(r.created_time),
          deposit: Number(r.deposit),
        })
      )
    ).filter((p) => isWanted(p.userId, p.contractId))

    // Every resolution notification of theirs on those markets, including
    // ones already fixed, which account for their own payouts.
    const notifications = (
      await pg.map<ResolutionNotification>(
        `select user_id, notification_id,
                data->>'sourceContractId' as contract_id,
                data->'data'->>'answerId' as answer_id,
                data->'data'->>'outcome' as outcome,
                (data->>'createdTime')::bigint as created_time,
                (data->'data'->>'userPayout')::numeric as user_payout,
                data->'data' ? 'userLiquidityPayout' as fixed
         from user_notifications
         where user_id = any($1)
           and data->>'sourceContractId' = any($2)
           and data->>'sourceType' = 'contract'
           and data->>'sourceUpdateType' = 'resolved'
           and data->'data' ? 'userPayout'
           and (data->>'createdTime')::bigint >= $3`,
        [users, contractIds, since - CLOCK_SKEW_MS],
        (r) => ({
          userId: r.user_id,
          notificationId: r.notification_id,
          contractId: r.contract_id,
          answerId: r.answer_id ?? null,
          outcome: r.outcome ?? null,
          createdTime: Number(r.created_time),
          userPayout: Number(r.user_payout),
          fixed: r.fixed === true,
        })
      )
    ).filter((n) => isWanted(n.userId, n.contractId))

    const { fixes, doubtful } = getNotificationFixes(notifications, payouts)
    allFixes.push(...fixes)
    allDoubtful.push(...doubtful)
    console.log(
      `${users.length} users: ${payouts.length} payouts, ` +
        `${notifications.length} notifications, ${fixes.length} to fix, ` +
        `${doubtful.length} doubtful`
    )
  }

  for (const { notification: n, reason } of allDoubtful) {
    console.log(
      `[DOUBTFUL] ${n.userId}/${n.notificationId} on ${n.contractId}: ${reason}; left alone`
    )
  }
  console.log(
    `Summary: ${allFixes.length} notifications to fix for ` +
      `${uniq(allFixes.map((f) => f.userId)).length} users, ` +
      `${allDoubtful.length} doubtful left alone. ` +
      `Liquidity moved out of userPayout: ${sumBy(
        allFixes,
        (f) => f.userLiquidityPayout
      ).toFixed(2)}`
  )
  for (const f of allFixes.slice(0, 10)) {
    console.log(
      `  e.g. ${f.userId}/${f.notificationId}: userPayout ${f.oldUserPayout} ` +
        `-> ${f.userPayout}, userLiquidityPayout ${f.userLiquidityPayout}`
    )
  }

  if (!apply || allFixes.length === 0) {
    if (!apply) console.log('Dry run complete. Re-run with --apply to write.')
    return
  }

  let updated = 0
  for (const batch of chunk(allFixes, UPDATE_BATCH)) {
    const result = await pg.result(
      `update user_notifications n
       set data = jsonb_set(
         jsonb_set(n.data, '{data,userPayout}', to_jsonb(v.user_payout)),
         '{data,userLiquidityPayout}', to_jsonb(v.liquidity_payout))
       from unnest($1::text[], $2::text[], $3::float8[], $4::float8[])
         as v(user_id, notification_id, user_payout, liquidity_payout)
       where n.user_id = v.user_id and n.notification_id = v.notification_id
         and not (n.data->'data' ? 'userLiquidityPayout')`,
      [
        batch.map((f) => f.userId),
        batch.map((f) => f.notificationId),
        batch.map((f) => f.userPayout),
        batch.map((f) => f.userLiquidityPayout),
      ]
    )
    updated += result.rowCount
    console.log(`Updated ${updated}/${allFixes.length}`)
  }
  console.log(`Done: ${updated} notifications updated.`)
})
