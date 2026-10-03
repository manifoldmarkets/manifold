import { Answer } from './answer'
import { CPMMMultiContract } from './contract'
import { noFees } from './fees'
import { getSaleResultMultiSumsToOne } from './sell-bet'
import { getSellPreviewAmounts } from './sell-preview'
import { EPSILON } from './util/math'

const answers = ['home', 'away'].map(
  (id, index) =>
    ({
      id,
      index,
      prob: 0.5,
      poolYes: 100,
      poolNo: 100,
    } as Answer)
)
const contract = {
  mechanism: 'cpmm-multi-1',
  outcomeType: 'MULTIPLE_CHOICE',
  shouldAnswersSumToOne: true,
  addAnswersMode: 'DISABLED',
  answers,
  collectedFees: noFees,
} as CPMMMultiContract

describe('getSellPreviewAmounts', () => {
  it.each([0, -4.44e-16, EPSILON])(
    'shows finite zero financials for an empty/dust position of %s shares',
    (shares) => {
      const { sellQuantity, saleFrac } = getSellPreviewAmounts(shares, shares)
      const { saleValue } = getSaleResultMultiSumsToOne(
        contract,
        'away',
        sellQuantity,
        'YES',
        [],
        {}
      )
      const loanPaid = saleFrac * 20
      const costBasis = saleFrac * 30
      expect(sellQuantity).toBe(0)
      expect(loanPaid).toBe(0)
      expect(saleValue - costBasis).toBe(0)
      expect(saleValue - loanPaid).toBe(0)
    }
  )

  it('disables a stale sale after the position is drained while the modal is open', () => {
    expect(getSellPreviewAmounts(0, 50)).toEqual({
      isSellingAllShares: false,
      sellQuantity: 0,
      saleFrac: 0,
    })
  })

  it.each([NaN, Infinity, -Infinity])(
    'keeps non-finite shares or amounts (%s) out of the sale calculation',
    (invalid) => {
      for (const [shares, amount] of [
        [invalid, 10],
        [10, invalid],
      ]) {
        expect(getSellPreviewAmounts(shares, amount)).toEqual({
          isSellingAllShares: false,
          sellQuantity: 0,
          saleFrac: 0,
        })
      }
    }
  )

  it.each([undefined, 0, -1, EPSILON])(
    'does not sell a fractional remainder for an empty/invalid amount %s',
    (amount) => {
      expect(getSellPreviewAmounts(0.4, amount)).toEqual({
        isSellingAllShares: false,
        sellQuantity: 0,
        saleFrac: 0,
      })
    }
  )

  it.each([
    [0.4, 0.2, 0.5],
    [0.4, 0.4, 1],
    [10.75, 0.5, 0.5 / 10.75],
    [0.000001, 0.000001, 1],
  ])(
    'preserves selling %s shares in quantity %s with fraction %s',
    (shares, amount, saleFrac) => {
      expect(getSellPreviewAmounts(shares, amount)).toEqual({
        isSellingAllShares: false,
        sellQuantity: amount,
        saleFrac,
      })
    }
  )

  it('includes the fractional remainder when selling the displayed whole balance', () => {
    expect(getSellPreviewAmounts(10.75, 10)).toEqual({
      isSellingAllShares: true,
      sellQuantity: 10.75,
      saleFrac: 1,
    })
  })
})
