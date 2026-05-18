export const OFFER_MANA_AMOUNT = 5000
export const OFFER_PRICE_STRIPE = 40
export const OFFER_PRICE_CRYPTO = 35
export const OFFER_DURATION_MS = 24 * 60 * 60 * 1000

// Standard rate is 100 mana / $1, so M5,000 normally costs $50. Best
// discount path is crypto, so e.g. $35 = 30% off the $50 anchor.
export const OFFER_MAX_DISCOUNT_PCT = Math.round(
  ((OFFER_MANA_AMOUNT / 100 - OFFER_PRICE_CRYPTO) /
    (OFFER_MANA_AMOUNT / 100)) *
    100
)

export type PersonalizedManaOfferStatus =
  | 'pending'
  | 'active'
  | 'redeemed'
  | 'expired'
  | 'voided'

export type PersonalizedManaOfferSummary = {
  pendingCount: number
  activeCount: number
  nextExpiresAt: number | null
  nextRedeemableOfferId: string | null
  manaAmount: number
  priceUsdStripe: number
  priceUsdCrypto: number
}
