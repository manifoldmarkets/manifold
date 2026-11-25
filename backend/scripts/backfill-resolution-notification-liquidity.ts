// Corrects market-resolution notifications sent before Nov 2026 to people who
// had added liquidity: their userPayout counted what the liquidity paid back
// as trading winnings, so the notification showed a profit they hadn't made.
// Each one gets the liquidity's share moved from userPayout to
// userLiquidityPayout, as new notifications have it.
//
// Run at least an hour after the API that writes userLiquidityPayout is
// deployed: notifications sent before that deploy and after this runs would
// stay wrong, and it only reads notifications over an hour old (so every
// resolution and unresolve before them has long committed). Notifications that
// already have userLiquidityPayout are skipped, so it's safe to re-run.
// A notification that can't be paired with its resolution for certain (its
// market resolved more than once within an hour, say) is listed as DOUBTFUL
// and left alone.
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
  ISOLATION_MS,
  NotificationFix,
  ResolutionNotification,
  ResolutionPayout,
  ResolutionUndo,
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
  const until = Date.now() - ISOLATION_MS
  console.log(
    `${apply ? 'APPLY' : 'DRY RUN (no writes)'}: payouts since ${new Date(
      since
    ).toISOString()}, notifications before ${new Date(until).toISOString()}`
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

    // Their resolution notifications on those markets not fixed yet. Read
    // first: every resolution before them has committed by now, and is in
    // the reads after.
    const notifications = (
      await pg.map<ResolutionNotification>(
        `select user_id, notification_id,
                data->>'sourceContractId' as contract_id,
                data->'data'->>'answerId' as answer_id,
                data->'data'->>'outcome' as outcome,
                (data->>'createdTime')::bigint as created_time,
                (data->'data'->>'userPayout')::numeric as user_payout
         from user_notifications
         where user_id = any($1)
           and data->>'sourceContractId' = any($2)
           and data->>'sourceType' = 'contract'
           and data->>'sourceUpdateType' = 'resolved'
           and data->'data' ? 'userPayout'
           and not (data->'data' ? 'userLiquidityPayout')
           and (data->>'createdTime')::bigint >= $3
           and (data->>'createdTime')::bigint < $4`,
        [users, contractIds, since - CLOCK_SKEW_MS, until],
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
    ).filter((n) => isWanted(n.userId, n.contractId))

    // Every payout on those markets, to anyone: they give each market's
    // resolution times, and the users' own payouts.
    const payouts = await pg.map<ResolutionPayout>(
      `select to_id, from_id, data->'data'->>'answerId' as answer_id,
              ts_to_millis(created_time) as created_time,
              coalesce((data->'data'->>'deposit')::numeric, 0) as deposit
       from txns
       where category = 'CONTRACT_RESOLUTION_PAYOUT'
         and from_id = any($1)
         and created_time >= millis_to_ts($2)`,
      [contractIds, since - CLOCK_SKEW_MS - ISOLATION_MS],
      (r) => ({
        userId: r.to_id,
        contractId: r.from_id,
        answerId: r.answer_id ?? null,
        createdTime: Number(r.created_time),
        deposit: Number(r.deposit),
      })
    )

    const undos = await pg.map<ResolutionUndo>(
      `select u.to_id as contract_id,
              p.data->'data'->>'answerId' as answer_id,
              p.id is null as any_answer,
              ts_to_millis(u.created_time) as created_time
       from txns u
       left join txns p on p.id = u.data->'data'->>'revertsTxnId'
       where u.category = 'CONTRACT_UNDO_RESOLUTION_PAYOUT'
         and u.to_id = any($1)
         and u.created_time >= millis_to_ts($2)`,
      [contractIds, since - CLOCK_SKEW_MS - ISOLATION_MS],
      (r) => ({
        contractId: r.contract_id,
        answerId: r.answer_id ?? null,
        anyAnswer: r.any_answer === true,
        createdTime: Number(r.created_time),
      })
    )

    const { fixes, doubtful } = getNotificationFixes(
      notifications,
      payouts,
      undos,
      since
    )
    allFixes.push(...fixes)
    allDoubtful.push(...doubtful)
    console.log(
      `${users.length} users: ${payouts.length} payouts, ${undos.length} undos, ` +
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
