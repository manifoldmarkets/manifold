export const OFFER_MANA_AMOUNT = 5000
export const OFFER_PRICE_STRIPE = 40
export const OFFER_PRICE_CRYPTO = 35
export const OFFER_DURATION_MS = 72 * 60 * 60 * 1000

// Standard rate is 100 mana / $1, so M5,000 normally costs $50. Best
// discount path is crypto, so e.g. $35 = 30% off the $50 anchor.
export const OFFER_MAX_DISCOUNT_PCT = Math.round(
  ((OFFER_MANA_AMOUNT / 100 - OFFER_PRICE_CRYPTO) /
    (OFFER_MANA_AMOUNT / 100)) *
    100
)

// Cross-method lock window. When a Stripe or Daimo session is opened for an
// offer, we mark the offer pending for this many minutes; further session
// attempts (any payment method) are rejected with a 409 until the lock
// expires or the session resolves. Prevents the "I accidentally paid full
// price on a second tab" failure mode.
export const PAYMENT_PENDING_LOCK_MINUTES = 30

export type PersonalizedManaOfferStatus =
  | 'pending'
  | 'active'
  | 'redeemed'
  | 'expired'
  | 'voided'

export type PersonalizedManaOfferSummary = {
  pendingCount: number
  // Counts only non-dismissed active offers — what drives the card + badge.
  activeCount: number
  // Active offers the user has dismissed. Still redeemable via the
  // notification deep link or by clicking the "N hidden" chip on /checkout.
  dismissedCount: number
  nextExpiresAt: number | null
  nextRedeemableOfferId: string | null
  // Earliest expires_at + soonest-expiring offer id across dismissed-active
  // offers. Powers the hidden-offers chip timer and the ?showOffer override.
  dismissedNextExpiresAt: number | null
  dismissedNextRedeemableOfferId: string | null
  manaAmount: number
  priceUsdStripe: number
  priceUsdCrypto: number
}
