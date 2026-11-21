import Stripe from 'stripe'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'

const initStripe = () =>
  new Stripe(process.env.STRIPE_APIKEY as string, {
    apiVersion: '2020-08-27',
    typescript: true,
  })

// Parent Coupon configured in Stripe Dashboard, applied via Promotion Code per
// offer. The coupon is 20% off (so a $50 base line item nets to $40) and is
// restricted to the $50 personalized-offer Product so it can't cross-apply
// to standard mana tier purchases. Stripe requires the coupon to exist before
// promotion codes can reference it.
const OFFER_COUPON_ID = () => {
  const id = process.env.STRIPE_20_OFF_5K_COUPON_ID
  if (!id) {
    throw new Error(
      'STRIPE_20_OFF_5K_COUPON_ID not configured — create a 20%-off Coupon ' +
        'in the Stripe Dashboard, restrict it to the offer Product, and set ' +
        'this env var.'
    )
  }
  return id
}

/**
 * Returns the Stripe Promotion Code id for this offer, creating one if not
 * already cached on the offer row. Idempotent — multiple calls for the same
 * offer return the same code. The code is `max_redemptions: 1` so Stripe
 * itself blocks the multi-tab race at payment time.
 *
 * Expires at offer.expires_at + 2h to match the redemption grace window.
 */
export const getOrCreateStripePromotionCodeForOffer = async (
  offerId: string
): Promise<string> => {
  const pg = createSupabaseDirectClient()

  const offer = await pg.oneOrNone<{
    stripe_promotion_code_id: string | null
    expires_at: string | null
    user_id: string
  }>(
    `select stripe_promotion_code_id, expires_at, user_id
       from personalized_mana_offers
      where id = $1`,
    [offerId]
  )

  if (!offer) {
    throw new Error(`Offer ${offerId} not found`)
  }

  if (offer.stripe_promotion_code_id) {
    return offer.stripe_promotion_code_id
  }

  // Promotion code expires 2h past offer expiry (= our SQL redemption grace).
  // Fall back to 24h from now if the offer somehow has no expires_at yet.
  const expiresAtMs = offer.expires_at
    ? new Date(offer.expires_at).getTime() + 2 * 60 * 60 * 1000
    : Date.now() + 24 * 60 * 60 * 1000

  const stripe = initStripe()
  const promo = await stripe.promotionCodes.create({
    coupon: OFFER_COUPON_ID(),
    max_redemptions: 1,
    expires_at: Math.floor(expiresAtMs / 1000),
    metadata: { offerId, userId: offer.user_id },
  })

  await pg.none(
    `update personalized_mana_offers
        set stripe_promotion_code_id = $2
      where id = $1
        and stripe_promotion_code_id is null`,
    [offerId, promo.id]
  )

  log('Stripe promotion code created for offer', { offerId, promoId: promo.id })
  return promo.id
}
