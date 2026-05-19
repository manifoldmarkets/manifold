import { runScript } from 'run-script'
import { createPersonalizedManaOfferNotification } from 'shared/notifications/create-personalized-mana-offer-notification'
import {
  OFFER_MANA_AMOUNT,
  OFFER_MAX_DISCOUNT_PCT,
} from 'common/personalized-mana-offer'

// One-off variant of backfill-personalized-mana-offers.ts scoped to a single
// user. Use this for prod smoke testing (the notification renders, the
// /checkout flow shows the card, end-to-end redemption works) before
// running the full population backfill.
//
// Usage:
//   yarn ts-node backfill-personalized-mana-offer-single-user.ts <userId>
//   yarn ts-node backfill-personalized-mana-offer-single-user.ts <userId> --dry-run
runScript(async ({ pg }) => {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const userId = args[0]
  const dryRun = process.argv.includes('--dry-run')

  if (!userId) {
    console.error(
      'Usage: yarn ts-node backfill-personalized-mana-offer-single-user.ts <userId> [--dry-run]'
    )
    process.exit(1)
  }

  const eligibleOrders = await pg.manyOrNone<{
    id: string
    user_id: string
  }>(
    `select o.id, o.user_id
       from shop_orders o
      where o.user_id = $1
        and o.status = 'SHIPPED'
        and not exists (
          select 1 from user_bans b
           where b.user_id = o.user_id
             and b.ban_type = 'purchase'
             and b.ended_at is null
             and (b.end_time is null or b.end_time > now())
        )`,
    [userId]
  )

  console.log(
    `Found ${eligibleOrders.length} eligible shipped merch order(s) for user ${userId}.`
  )

  if (eligibleOrders.length === 0) {
    console.log(
      'Nothing to backfill — user has no shipped/non-banned merch orders.'
    )
    return
  }

  if (dryRun) {
    console.log('Dry run — exiting without inserting offers or notifications.')
    return
  }

  let createdOffers = 0
  let notificationsSent = 0

  for (const order of eligibleOrders) {
    const row = await pg.oneOrNone<{ id: string }>(
      `insert into personalized_mana_offers (user_id, shop_order_id, source, status)
       values ($1, $2, 'merch_backfill', 'pending')
       on conflict (shop_order_id) do nothing
       returning id`,
      [order.user_id, order.id]
    )
    if (!row) {
      console.log(
        `Skipped order ${order.id} — offer already exists (idempotent).`
      )
      continue
    }

    createdOffers++
    try {
      await createPersonalizedManaOfferNotification(order.user_id, row.id, {
        reasonPhrase: 'buying some merch recently',
        manaAmount: OFFER_MANA_AMOUNT,
        maxDiscountPct: OFFER_MAX_DISCOUNT_PCT,
      })
      notificationsSent++
    } catch (e) {
      console.warn(
        `Notification failed for backfill offer ${row.id} (user ${order.user_id}):`,
        e
      )
    }
  }

  console.log(
    `Backfill complete: ${createdOffers} offer(s) created, ${notificationsSent} notification(s) sent.`
  )
})
