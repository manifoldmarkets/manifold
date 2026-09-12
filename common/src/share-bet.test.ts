import { Answer } from './answer'
import { CPMMMultiContract, Contract } from './contract'
import { getBetSharePrice } from './share-bet'
import { versusSide } from './versus'

const home = { id: 'home', text: 'Home' } as Answer
const away = { id: 'away', text: 'Away' } as Answer
const versus = {
  mechanism: 'cpmm-multi-1',
  outcomeType: 'MULTIPLE_CHOICE',
  shouldAnswersSumToOne: true,
  addAnswersMode: 'DISABLED',
  answers: [home, away],
} as CPMMMultiContract

describe('getBetSharePrice', () => {
  describe.each([
    ['home', 'YES', 'Home'],
    ['home', 'NO', 'Away'],
    ['away', 'YES', 'Away'],
    ['away', 'NO', 'Home'],
  ])('%s %s shares displayed as YES on %s', (answerId, outcome, answer) => {
    it.each([1, -1])(
      'quotes the backed share price for a trade with sign %s',
      (sign) => {
        const bet = { answerId, outcome, amount: sign * 30, shares: sign * 100 }
        expect(versusSide(versus, bet)?.answer.text).toBe(answer)
        expect(getBetSharePrice(versus, bet, 'average')).toBeCloseTo(0.3)
        expect(getBetSharePrice(versus, bet, 'limit')).toBeCloseTo(0.3)
      }
    )

    it.each([
      [0, 0],
      [20, 100],
      [-40, -100],
    ])(
      'quotes the backed limit price with %s spent and %s shares filled',
      (amount, shares) => {
        const bet = {
          answerId,
          outcome,
          amount,
          shares,
          limitProb: outcome === 'YES' ? 0.3 : 0.7,
        }
        expect(getBetSharePrice(versus, bet, 'limit')).toBeCloseTo(0.3)
      }
    )
  })

  it.each(['YES', 'NO'])('keeps non-versus %s share card prices', (outcome) => {
    const binary = { mechanism: 'cpmm-1', outcomeType: 'BINARY' } as Contract
    const multipleChoice = { ...versus, addAnswersMode: 'ANYONE' } as Contract
    const bet = { answerId: 'home', outcome, amount: 30, shares: 100 }
    for (const contract of [binary, multipleChoice]) {
      const average = outcome === 'YES' ? 0.3 : 0.7
      expect(getBetSharePrice(contract, bet, 'average')).toBeCloseTo(average)
      expect(getBetSharePrice(contract, bet, 'limit')).toBeCloseTo(average)
      const order = { ...bet, limitProb: 0.4 }
      expect(getBetSharePrice(contract, order, 'limit')).toBe(0.4)
      expect(getBetSharePrice(contract, order, 'average')).toBeCloseTo(average)
    }
  })

  it('keeps the stored answer price when the versus answer is unknown', () => {
    const bet = { answerId: 'missing', outcome: 'NO', amount: 30, shares: 100 }
    expect(getBetSharePrice(versus, bet, 'average')).toBeCloseTo(0.7)
    expect(getBetSharePrice(versus, { ...bet, limitProb: 0.6 }, 'limit')).toBe(
      0.6
    )
  })
})
