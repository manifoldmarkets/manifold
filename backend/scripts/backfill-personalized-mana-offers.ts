import { runScript } from 'run-script'
import { createPersonalizedManaOfferNotification } from 'shared/notifications/create-personalized-mana-offer-notification'
import {
  OFFER_MANA_AMOUNT,
  OFFER_MAX_DISCOUNT_PCT,
} from 'common/personalized-mana-offer'

const dryRun = process.argv.includes('--dry-run')

runScript(async ({ pg }) => {
  // One offer per shipped/delivered merch order, EXCLUDING users who currently
  // have an active purchase ban (they couldn't redeem it anyway — surfacing the
  // offer would be misleading and a support-ticket vector). The unique index
  // on shop_order_id keeps this idempotent across re-runs.
  const eligibleOrders = await pg.manyOrNone<{
    id: string
    user_id: string
  }>(
    `select o.id, o.user_id
       from shop_orders o
      where o.status = 'SHIPPED'
        and not exists (
          select 1 from user_bans b
           where b.user_id = o.user_id
             and b.ban_type = 'purchase'
             and b.ended_at is null
             and (b.end_time is null or b.end_time > now())
        )`
  )

  console.log(`Found ${eligibleOrders.length} eligible shipped/delivered merch orders.`)

  if (dryRun) {
    console.log('Dry run — exiting without inserting offers or notifications.')
    return
  }

  let createdOffers = 0
  let notificationsSent = 0
  const NOTIFICATION_BATCH_SIZE = 100
  const BATCH_PAUSE_MS = 1000

  for (let i = 0; i < eligibleOrders.length; i++) {
    const order = eligibleOrders[i]
    const row = await pg.oneOrNone<{ id: string }>(
      `insert into personalized_mana_offers (user_id, shop_order_id, source, status)
       values ($1, $2, 'merch_backfill', 'pending')
       on conflict (shop_order_id) do nothing
       returning id`,
      [order.user_id, order.id]
    )
    if (!row) continue

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

    // Brief pause every batch so we don't hammer Expo / the DB on a large
    // historical backfill. Negligible for small dev runs.
    if ((i + 1) % NOTIFICATION_BATCH_SIZE === 0) {
      await new Promise((r) => setTimeout(r, BATCH_PAUSE_MS))
    }
  }

  console.log(
    `Backfill complete: ${createdOffers} offers created, ${notificationsSent} notifications sent.`
  )
})
