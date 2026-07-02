import { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'

/**
 * Called by the frontend when the user closes a payment modal/tab without
 * completing payment. Releases the pending lock so they can immediately
 * start a new checkout for the same offer.
 *
 * Only clears the lock for offers that are still 'active' — once redeemed,
 * the lock is moot anyway. Self-targeted: a user can only release locks on
 * their own offers.
 */
export const releasePersonalizedManaOfferLock: APIHandler<
  'release-personalized-mana-offer-lock'
> = async ({ offerId }, auth) => {
  const pg = createSupabaseDirectClient()

  await pg.none(
    `update personalized_mana_offers
        set payment_pending_session_id = null,
            payment_pending_at = null
      where id = $1
        and user_id = $2
        and status = 'active'`,
    [offerId, auth.uid]
  )

  return { success: true }
}
