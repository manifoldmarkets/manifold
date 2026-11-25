import {
  getLiquidityPayoutText,
  getShownLiquidityPayout,
  isShownAmount,
} from './notification'

describe('resolution notification liquidity line', () => {
  it('shows mana from 1 either way, sweepcash from 0.01', () => {
    expect(getShownLiquidityPayout({ userLiquidityPayout: 356.88 })).toBe(
      356.88
    )
    expect(getShownLiquidityPayout({ userLiquidityPayout: 0.9 })).toBe(0)
    expect(getShownLiquidityPayout({ userLiquidityPayout: -30 })).toBe(-30)
    expect(
      getShownLiquidityPayout({ userLiquidityPayout: 0.5, token: 'CASH' })
    ).toBe(0.5)
    expect(getShownLiquidityPayout({})).toBe(0)
    expect(getShownLiquidityPayout({ userLiquidityPayout: NaN })).toBe(0)
    expect(isShownAmount(-0.99)).toBe(false)
    // As formatMoney shows them: M$1 and 0.01
    expect(isShownAmount(0.9999999999999999)).toBe(true)
    expect(isShownAmount(0.009, 'CASH')).toBe(true)
    expect(isShownAmount(0.004, 'CASH')).toBe(false)
  })

  it('says whether liquidity came back or was taken back', () => {
    expect(getLiquidityPayoutText(356.88, 'M$356')).toBe(
      'You got M$356 back from the liquidity you added'
    )
    expect(getLiquidityPayoutText(-30, 'M$30')).toBe(
      'M$30 of the liquidity you withdrew was taken back'
    )
  })
})
