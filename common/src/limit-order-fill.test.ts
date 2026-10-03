import { LimitBet } from './bet'
import { Answer } from './answer'
import { MultiContract } from './contract'
import { noFees } from './fees'
import { getSaleResultMultiSumsToOne } from './sell-bet'

it('reports other-answer order dependencies without counting their shares as sold shares', () => {
  const answers = ['a', 'b', 'c'].map(
    (id) =>
      ({
        id,
        contractId: 'multi',
        poolYes: 20000,
        poolNo: 10000,
        prob: 1 / 3,
        createdTime: 0,
        text: id,
        userId: 'creator',
      } as Answer)
  )
  const contract = {
    id: 'multi',
    mechanism: 'cpmm-multi-1',
    shouldAnswersSumToOne: true,
    answers,
    collectedFees: noFees,
  } as MultiContract
  const orders = ['b', 'c'].map(
    (id) =>
      ({
        id: `order-${id}`,
        contractId: 'multi',
        userId: `maker-${id}`,
        answerId: id,
        createdTime: 1,
        amount: 0,
        shares: 0,
        outcome: 'NO',
        orderAmount: 10000,
        limitProb: 1 / 3,
        isFilled: false,
        isCancelled: false,
        fills: [],
        probBefore: 1 / 3,
        probAfter: 1 / 3,
        fees: noFees,
        isRedemption: false,
      } as LimitBet)
  )
  const withOrders = getSaleResultMultiSumsToOne(
    contract,
    'a',
    2000,
    'YES',
    orders,
    { 'maker-b': 100000, 'maker-c': 100000 }
  )
  const withoutOrders = getSaleResultMultiSumsToOne(
    contract,
    'a',
    2000,
    'YES',
    [],
    {}
  )
  expect(withOrders.saleValue).toBeGreaterThan(withoutOrders.saleValue)
  expect(withOrders.limitOrderFill).toEqual({
    shares: 0,
    orderCount: 0,
    otherAnswerOrderCount: 2,
  })
  expect(withoutOrders.limitOrderFill).toEqual({ shares: 0, orderCount: 0 })
})
