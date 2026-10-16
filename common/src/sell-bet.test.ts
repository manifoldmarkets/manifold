import { getCpmmMultiSellSharesInfo } from './sell-bet'
import { MultiContract } from './contract'
import { noFees } from './fees'

// getCpmmMultiSellSharesInfo redeems full YES sets at M$1 each, which is only
// correct when the market's answers are constrained to sum to one. On an
// independent market the probabilities can add up to less than one, so this
// would pay sellers more than their shares are worth.
describe('getCpmmMultiSellSharesInfo', () => {
  const baseContract = {
    mechanism: 'cpmm-multi-1',
    answers: [],
    collectedFees: noFees,
  }

  it('throws when the answers do not sum to one', () => {
    const contract = {
      ...baseContract,
      shouldAnswersSumToOne: false,
    } as unknown as MultiContract
    expect(() => getCpmmMultiSellSharesInfo(contract, {}, [], {}, {})).toThrow(
      /sum to one/i
    )
  })

  it('does not trip the guard on a sum-to-one market', () => {
    const contract = {
      ...baseContract,
      shouldAnswersSumToOne: true,
    } as unknown as MultiContract
    expect(() =>
      getCpmmMultiSellSharesInfo(contract, {}, [], {}, {})
    ).not.toThrow(/sum to one/i)
  })
})
