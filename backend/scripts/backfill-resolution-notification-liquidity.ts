// Corrects market-resolution notifications sent before Nov 2026 to people who
// had added liquidity: their userPayout counted what the liquidity paid back
// as trading winnings, so the notification showed a profit they hadn't made.
// Each one gets the liquidity's share moved from userPayout to
// userLiquidityPayout, as new notifications have it.
//
// Run after the API that writes userLiquidityPayout is deployed: notifications
// sent before that deploy and after this runs would stay wrong. Notifications
// that already have userLiquidityPayout are skipped, so it's safe to re-run.
//
// Dry run (default), last 90 days:
//   yarn ts-node backfill-resolution-notification-liquidity.ts
// Another start date (UTC):
//   yarn ts-node backfill-resolution-notification-liquidity.ts --since=2026-01-01
// Apply:
//   yarn ts-node backfill-resolution-notification-liquidity.ts --apply

import { chunk, sumBy, uniq } from 'lodash'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'
import { DAY_MS } from 'common/util/time'
import { runScript } from './run-script'
import {
  getNotificationFixes,
  MAX_NOTIFICATION_DELAY_MS,
  NotificationFix,
  ResolutionNotification,
  ResolutionPayout,
} from './resolution-notification-liquidity'

const DEFAULT_DAYS = 90
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

  const allFixes: NotificationFix[] = []
  let doubtfulCount = 0
  const end = Date.now()
  for (let start = since; start < end; start += DAY_MS) {
    const dayEnd = Math.min(start + DAY_MS, end)

    // Payouts that included some of the user's liquidity, this day
    const liquidityPayouts = await pg.manyOrNone<{
      user_id: string
      contract_id: string
    }>(
      `select distinct to_id as user_id, from_id as contract_id
       from txns
       where category = 'CONTRACT_RESOLUTION_PAYOUT'
         and created_time >= millis_to_ts($1) and created_time < millis_to_ts($2)
         and (data->'data'->>'deposit')::numeric > 0
         and to_id <> all($3)`,
      [start, dayEnd, HOUSE_IDS]
    )
    if (liquidityPayouts.length === 0) continue
    const userIds = liquidityPayouts.map((p) => p.user_id)
    const contractIds = liquidityPayouts.map((p) => p.contract_id)

    // Every payout to those users on those markets around this day, including
    // ones without a deposit, so each notification finds its own resolution.
    const payouts = await pg.map<ResolutionPayout>(
      `select t.to_id, t.from_id, t.data->'data'->>'answerId' as answer_id,
              ts_to_millis(t.created_time) as created_time,
              coalesce((t.data->'data'->>'deposit')::numeric, 0) as deposit
       from txns t
       join unnest($1::text[], $2::text[]) as k(user_id, contract_id)
         on t.to_id = k.user_id and t.from_id = k.contract_id
       where t.category = 'CONTRACT_RESOLUTION_PAYOUT'
         and t.created_time >= millis_to_ts($3)
         and t.created_time < millis_to_ts($4)`,
      [
        userIds,
        contractIds,
        start - MAX_NOTIFICATION_DELAY_MS,
        dayEnd + MAX_NOTIFICATION_DELAY_MS,
      ],
      (r) => ({
        userId: r.to_id,
        contractId: r.from_id,
        answerId: r.answer_id ?? null,
        createdTime: Number(r.created_time),
        deposit: Number(r.deposit),
      })
    )

    const notifications = await pg.map<ResolutionNotification>(
      `select n.user_id, n.notification_id,
              n.data->>'sourceContractId' as contract_id,
              n.data->'data'->>'answerId' as answer_id,
              n.data->'data'->>'outcome' as outcome,
              (n.data->>'createdTime')::bigint as created_time,
              (n.data->'data'->>'userPayout')::numeric as user_payout
       from user_notifications n
       join unnest($1::text[], $2::text[]) as k(user_id, contract_id)
         on n.user_id = k.user_id and n.data->>'sourceContractId' = k.contract_id
       where n.data->>'sourceType' = 'contract'
         and n.data->>'sourceUpdateType' = 'resolved'
         and n.data->'data' ? 'userPayout'
         and not (n.data->'data' ? 'userLiquidityPayout')
         and (n.data->>'createdTime')::bigint >= $3
         and (n.data->>'createdTime')::bigint < $4`,
      [userIds, contractIds, start, dayEnd + MAX_NOTIFICATION_DELAY_MS],
      (r) => ({
        userId: r.user_id,
        notificationId: r.notification_id,
        contractId: r.contract_id,
        answerId: r.answer_id ?? null,
        outcome: r.outcome ?? null,
        createdTime: Number(r.created_time),
        userPayout: Number(r.user_payout),
      })
    )

    const { fixes, doubtful } = getNotificationFixes(notifications, payouts)
    for (const { notification, deposit } of doubtful) {
      console.log(
        `[DOUBTFUL] ${notification.userId}/${notification.notificationId} ` +
          `on ${notification.contractId}: userPayout ${notification.userPayout} ` +
          `below the liquidity's ${deposit}; left alone`
      )
    }
    doubtfulCount += doubtful.length
    // A notification sent shortly after midnight can be found on two days.
    const seen = new Set(allFixes.map((f) => `${f.userId}|${f.notificationId}`))
    const newFixes = fixes.filter(
      (f) => !seen.has(`${f.userId}|${f.notificationId}`)
    )
    allFixes.push(...newFixes)
    console.log(
      `${new Date(start).toISOString().slice(0, 10)}: ` +
        `${liquidityPayouts.length} liquidity payouts, ` +
        `${notifications.length} notifications checked, ${newFixes.length} to fix`
    )
  }

  console.log(
    `Summary: ${allFixes.length} notifications to fix for ` +
      `${uniq(allFixes.map((f) => f.userId)).length} users, ` +
      `${doubtfulCount} doubtful left alone. ` +
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
