import { MINUTE_MS } from './util/time'

// Black Friday / Cyber Monday sale calendar.
//
// Web reads this for the home banner, the /checkout note and shop prices; the
// API reads it to charge shop items and attach the card coupon. Both sides use
// the same windows and the same discount, so the price a buyer sees is the
// price they pay.
//
// Two discounts run during a sale:
// - Shop: `shopDiscount` comes off the price of everything in the shop (merch
//   and cosmetics, streak freezes etc.), charged by the API in mana. Never
//   merch shipping, and never memberships: tier changes credit the unused
//   time at the full tier price, and renewals charge full price. It takes the
//   place of the supporter shop discount when it's bigger; the two don't
//   stack.
// - Mana by card: the API attaches the Stripe coupon `manaStripeCouponId` to
//   every standard mana pack checkout session it creates inside the window.
//   There is no code to type, so nothing works before or after the window. The
//   coupon must exist in Stripe (prod and dev) as `manaDiscount` percent off;
//   if it doesn't, checkout carries on at full price and the API logs an
//   error. Crypto, boosts and personalized offers don't get it.

export type HolidaySaleKind = 'black-friday' | 'cyber-monday'

export type HolidaySale = {
  // Also the banner's dismiss key, so a new sale shows again after a dismiss.
  id: string
  kind: HolidaySaleKind
  name: string
  startTime: number // ms, inclusive
  endTime: number // ms, exclusive
  shopDiscount: number // fraction off a shop item's price, 0 < x < 1
  manaDiscount: number // fraction off a card mana pack, 0 < x < 1
  // Custom id of a Stripe coupon for `manaDiscount` percent off, duration
  // "once". Coupon ids aren't secret: a coupon with no promotion code can only
  // be applied by our API.
  manaStripeCouponId: string
}

// Pacific time, like last year's sale (Nov 2025: Black Friday Fri–Sun, Cyber
// Monday Mon). Late November is PST, UTC-8.
export const HOLIDAY_SALES: readonly HolidaySale[] = [
  {
    id: 'black-friday-2026',
    kind: 'black-friday',
    name: 'Black Friday',
    startTime: Date.parse('2026-11-27T00:00:00-08:00'),
    endTime: Date.parse('2026-11-30T00:00:00-08:00'),
    shopDiscount: 0.25,
    manaDiscount: 0.25,
    manaStripeCouponId: 'bfcm-2026-25-off',
  },
  {
    id: 'cyber-monday-2026',
    kind: 'cyber-monday',
    name: 'Cyber Monday',
    startTime: Date.parse('2026-11-30T00:00:00-08:00'),
    endTime: Date.parse('2026-12-01T00:00:00-08:00'),
    shopDiscount: 0.25,
    manaDiscount: 0.25,
    manaStripeCouponId: 'bfcm-2026-25-off',
  },
]

// The API charges the sale merch price from this long before a sale starts
// until this long after it ends. Merch takes mana with no second
// confirmation, so the server must never charge more than the form showed:
// a form opened at 11:58pm, or a device clock a few minutes fast, shows the
// sale price. The error only ever runs in the buyer's favour. Merch only:
// card checkouts show Stripe's real price before payment, so they follow the
// exact window. Web never uses the grace.
export const HOLIDAY_SALE_CHARGE_GRACE_MS = 15 * MINUTE_MS

export function getActiveHolidaySale(
  now: number,
  graceMs = 0,
  sales: readonly HolidaySale[] = HOLIDAY_SALES
): HolidaySale | undefined {
  if (!Number.isFinite(now)) return undefined
  const grace = Number.isFinite(graceMs) && graceMs > 0 ? graceMs : 0
  // A sale that is running wins over one inside its grace, so Cyber Monday
  // takes over from Black Friday at midnight.
  return (
    sales.find((s) => now >= s.startTime && now < s.endTime) ??
    sales.find((s) => now >= s.startTime - grace && now < s.endTime + grace)
  )
}

// When a Stripe checkout session carrying the sale coupon stops being payable:
// when the sale ends, within Stripe's allowed range of 30 minutes to 24 hours
// from creation. So a session opened at 11:59pm can be paid until about
// 12:30am, like an order placed before midnight, but not all the next day.
// Card sessions get no grace: Stripe shows the real price before payment.
const STRIPE_SESSION_MIN_MS = 31 * MINUTE_MS
const STRIPE_SESSION_MAX_MS = 24 * 60 * MINUTE_MS
export function getSaleCheckoutExpiresAt(
  sale: HolidaySale,
  now: number
): number {
  return Math.min(
    Math.max(sale.endTime, now + STRIPE_SESSION_MIN_MS),
    now + STRIPE_SESSION_MAX_MS
  )
}

// A discount fraction we can charge: anything outside 0 < x < 1 (NaN, a
// negative, 1 or more) counts as no discount, never as a free item.
export function toDiscountFraction(x: number | undefined): number {
  if (x === undefined || !Number.isFinite(x) || x <= 0 || x >= 1) return 0
  return x
}

export type ShopDiscount = {
  fraction: number
  // Set when the sale's discount is the one applied.
  sale?: HolidaySale
}

// Best single discount on a shop item: the supporter's shop discount or the
// sale's, whichever is bigger. Ties go to the supporter discount. Callers pass
// no sale for memberships.
export function getShopDiscount(
  supporterDiscount: number,
  sale: HolidaySale | undefined
): ShopDiscount {
  const supporter = toDiscountFraction(supporterDiscount)
  const saleFraction = toDiscountFraction(sale?.shopDiscount)
  return saleFraction > supporter
    ? { fraction: saleFraction, sale }
    : { fraction: supporter }
}

// Same rounding the shop has always used for the supporter discount, so
// supporter prices outside a sale don't move by a mana.
export function applyShopDiscount(price: number, fraction: number): number {
  const f = toDiscountFraction(fraction)
  return f > 0 ? Math.floor(price * (1 - f)) : price
}

// What Stripe charges for a card mana pack with the sale coupon, in dollars:
// a percent-off coupon takes the discount off in whole cents.
export function getSaleCardPriceInDollars(
  priceInDollars: number,
  fraction: number
): number {
  const f = toDiscountFraction(fraction)
  if (!Number.isFinite(priceInDollars) || f === 0) return priceInDollars
  const cents = Math.round(priceInDollars * 100)
  return (cents - Math.round(cents * f)) / 100
}

export const formatDiscountPercent = (fraction: number) =>
  `${Math.round(toDiscountFraction(fraction) * 100)}%`
