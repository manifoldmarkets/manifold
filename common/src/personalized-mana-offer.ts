export const OFFER_MANA_AMOUNT = 5000
export const OFFER_PRICE_STRIPE = 40
export const OFFER_PRICE_CRYPTO = 35
export const OFFER_DURATION_MS = 72 * 60 * 60 * 1000

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
