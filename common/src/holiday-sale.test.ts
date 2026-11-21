import {
  HOLIDAY_SALES,
  HOLIDAY_SALE_CHARGE_GRACE_MS,
  HolidaySale,
  applyShopDiscount,
  getActiveHolidaySale,
  getShopDiscount,
  getSaleCardPriceInDollars,
  getSaleCheckoutExpiresAt,
  toDiscountFraction,
} from './holiday-sale'
import { WEB_PRICES } from './economy'
import { SHOP_ITEMS } from './shop/items'

const blackFriday = HOLIDAY_SALES.find((s) => s.id === 'black-friday-2026')!
const cyberMonday = HOLIDAY_SALES.find((s) => s.id === 'cyber-monday-2026')!

describe('HOLIDAY_SALES config', () => {
  it('has well-formed, non-overlapping windows with chargeable discounts', () => {
    const sorted = [...HOLIDAY_SALES].sort((a, b) => a.startTime - b.startTime)
    sorted.forEach((s, i) => {
      expect(Number.isFinite(s.startTime)).toBe(true)
      expect(Number.isFinite(s.endTime)).toBe(true)
      expect(s.endTime).toBeGreaterThan(s.startTime)
      expect(toDiscountFraction(s.shopDiscount)).toBe(s.shopDiscount)
      expect(toDiscountFraction(s.manaDiscount)).toBe(s.manaDiscount)
      // Stripe coupon ids: letters, digits, - and _ only.
      expect(s.manaStripeCouponId).toMatch(/^[a-z0-9_-]+$/)
      if (i > 0)
        expect(s.startTime).toBeGreaterThanOrEqual(sorted[i - 1].endTime)
    })
    expect(new Set(HOLIDAY_SALES.map((s) => s.id)).size).toBe(
      HOLIDAY_SALES.length
    )
  })

  it('runs Black Friday Fri–Sun and Cyber Monday Mon, Pacific time', () => {
    expect(blackFriday.startTime).toBe(Date.UTC(2026, 10, 27, 8))
    expect(blackFriday.endTime).toBe(Date.UTC(2026, 10, 30, 8))
    expect(cyberMonday.startTime).toBe(blackFriday.endTime)
    expect(cyberMonday.endTime).toBe(Date.UTC(2026, 11, 1, 8))
  })
})

describe('getActiveHolidaySale', () => {
  it('is off before, on during, and off after', () => {
    expect(getActiveHolidaySale(blackFriday.startTime - 1)).toBeUndefined()
    expect(getActiveHolidaySale(blackFriday.startTime)).toBe(blackFriday)
    expect(getActiveHolidaySale(blackFriday.endTime - 1)).toBe(blackFriday)
    expect(getActiveHolidaySale(cyberMonday.startTime)).toBe(cyberMonday)
    expect(getActiveHolidaySale(cyberMonday.endTime - 1)).toBe(cyberMonday)
    expect(getActiveHolidaySale(cyberMonday.endTime)).toBeUndefined()
  })

  it('keeps charging the sale price for the grace after the last sale ends', () => {
    const g = HOLIDAY_SALE_CHARGE_GRACE_MS
    expect(getActiveHolidaySale(cyberMonday.endTime + g - 1, g)).toBe(
      cyberMonday
    )
    expect(getActiveHolidaySale(cyberMonday.endTime + g, g)).toBeUndefined()
  })

  it('charges merch the sale price from the grace before the first sale', () => {
    const g = HOLIDAY_SALE_CHARGE_GRACE_MS
    expect(getActiveHolidaySale(blackFriday.startTime - g, g)).toBe(blackFriday)
    expect(
      getActiveHolidaySale(blackFriday.startTime - g - 1, g)
    ).toBeUndefined()
    // Without the grace (web, card checkout) it starts exactly on time.
    expect(getActiveHolidaySale(blackFriday.startTime - 1)).toBeUndefined()
  })

  it('hands over to the next sale at its start, even inside the grace', () => {
    const g = HOLIDAY_SALE_CHARGE_GRACE_MS
    expect(getActiveHolidaySale(cyberMonday.startTime + 1, g)).toBe(cyberMonday)
  })

  it('ignores a bad clock or grace', () => {
    expect(getActiveHolidaySale(NaN)).toBeUndefined()
    expect(getActiveHolidaySale(Infinity)).toBeUndefined()
    expect(getActiveHolidaySale(cyberMonday.endTime, NaN)).toBeUndefined()
    expect(getActiveHolidaySale(cyberMonday.endTime, -1)).toBeUndefined()
  })
})

describe('getShopDiscount', () => {
  it('uses the supporter discount when no sale is on', () => {
    expect(getShopDiscount(0.1, undefined)).toEqual({ fraction: 0.1 })
    expect(getShopDiscount(0, undefined)).toEqual({ fraction: 0 })
  })

  it('uses the sale when it beats the supporter discount; never stacks', () => {
    expect(getShopDiscount(0, blackFriday)).toEqual({
      fraction: 0.25,
      sale: blackFriday,
    })
    expect(getShopDiscount(0.1, blackFriday)).toEqual({
      fraction: 0.25,
      sale: blackFriday,
    })
  })

  it('keeps a bigger or equal supporter discount', () => {
    expect(getShopDiscount(0.3, blackFriday)).toEqual({ fraction: 0.3 })
    expect(getShopDiscount(0.25, blackFriday)).toEqual({ fraction: 0.25 })
  })

  it('treats a misconfigured sale as no sale, never as free merch', () => {
    for (const shopDiscount of [1, 1.5, -0.2, NaN, Infinity]) {
      const bad: HolidaySale = { ...blackFriday, shopDiscount }
      expect(getShopDiscount(0.05, bad)).toEqual({ fraction: 0.05 })
    }
    expect(getShopDiscount(NaN, undefined)).toEqual({ fraction: 0 })
  })
})

describe('applyShopDiscount', () => {
  it('charges whole mana, rounding down, and never below 0', () => {
    expect(applyShopDiscount(5000, 0.25)).toBe(3750)
    expect(applyShopDiscount(3000, 0.25)).toBe(2250)
    expect(applyShopDiscount(3333, 0.25)).toBe(2499)
    expect(applyShopDiscount(5000, 0)).toBe(5000)
    expect(applyShopDiscount(5000, 1)).toBe(5000)
    expect(applyShopDiscount(5000, NaN)).toBe(5000)
  })

  it('matches the old supporter formula on every shop item', () => {
    const forSale = SHOP_ITEMS.filter((i) => i.price > 0)
    expect(forSale.some((i) => i.category === 'merch')).toBe(true)
    for (const item of forSale) {
      for (const f of [0.05, 0.1]) {
        expect(applyShopDiscount(item.price, f)).toBe(
          Math.floor(item.price * (1 - f))
        )
      }
      const salePrice = applyShopDiscount(item.price, blackFriday.shopDiscount)
      expect(Number.isInteger(salePrice)).toBe(true)
      expect(salePrice).toBeGreaterThan(0)
      expect(salePrice).toBeLessThan(item.price)
    }
  })

  it('leaves a free item free', () => {
    expect(applyShopDiscount(0, 0.25)).toBe(0)
  })
})

describe('getSaleCardPriceInDollars', () => {
  it('prices every card mana pack in whole cents at the sale discount', () => {
    const expected: Record<number, number> = {
      5: 3.75,
      25: 18.75,
      100: 75,
      1000: 750,
    }
    for (const { priceInDollars } of WEB_PRICES) {
      expect(getSaleCardPriceInDollars(priceInDollars, 0.25)).toBe(
        expected[priceInDollars]
      )
    }
  })

  it('leaves the price alone for no discount or a bad one', () => {
    expect(getSaleCardPriceInDollars(25, 0)).toBe(25)
    expect(getSaleCardPriceInDollars(25, 1)).toBe(25)
    expect(getSaleCardPriceInDollars(25, NaN)).toBe(25)
  })
})

describe('getSaleCheckoutExpiresAt', () => {
  const MIN = 60 * 1000

  it('lets a session opened early in the sale run the full 24 hours', () => {
    const now = blackFriday.startTime
    expect(getSaleCheckoutExpiresAt(blackFriday, now)).toBe(now + 24 * 60 * MIN)
  })

  it('ends a session opened near the end when the sale ends', () => {
    const now = cyberMonday.endTime - 3 * 60 * MIN
    expect(getSaleCheckoutExpiresAt(cyberMonday, now)).toBe(cyberMonday.endTime)
  })

  it('never asks Stripe for less than 31 minutes', () => {
    const now = cyberMonday.endTime - MIN
    expect(getSaleCheckoutExpiresAt(cyberMonday, now)).toBe(now + 31 * MIN)
  })
})

describe('card checkout cutoff', () => {
  it('stops attaching the coupon at the sale end, with no grace', () => {
    // The API calls getActiveHolidaySale(now) with no grace for cards.
    expect(getActiveHolidaySale(cyberMonday.endTime - 1)).toBe(cyberMonday)
    expect(getActiveHolidaySale(cyberMonday.endTime)).toBeUndefined()
  })
})
