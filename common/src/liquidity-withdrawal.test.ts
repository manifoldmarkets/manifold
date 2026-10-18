import { sumBy } from 'lodash'
import {
  getCpmmLiquidityPoolWeights,
  getLiquidityProvidersNetTotal,
  getLiquidityWithdrawalShares,
  removeCpmmLiquidity,
} from './calculate-cpmm'
import { CPMMContract } from './contract'
import { LiquidityProvision } from './liquidity-provision'
import { getLiquidityPoolPayouts } from './payouts-fixed'

let nextId = 0
const lp = (userId: string, amount: number): LiquidityProvision => ({
  id: `lp${nextId}`,
  userId,
  contractId: 'c',
  createdTime: nextId++,
  amount,
})

// Mirrors remove-liquidity.ts: pending subsidy first, then the pool, and a
// negative provision for each provider's share.
const withdraw = (
  state: {
    pool: { YES: number; NO: number }
    p: number
    subsidyPool: number
    liquidities: LiquidityProvision[]
  },
  amount: number
) => {
  const shares = getLiquidityWithdrawalShares(state.liquidities, amount)
  const takeFromPending = Math.min(state.subsidyPool, amount)
  const takeFromPool = amount - takeFromPending
  const { newPool, newP, error } = removeCpmmLiquidity(
    state.pool,
    state.p,
    takeFromPool
  )
  expect(error).toBe(false)
  return {
    shares,
    state: {
      pool: newPool as { YES: number; NO: number },
      p: newP,
      subsidyPool: state.subsidyPool - takeFromPending,
      liquidities: [
        ...state.liquidities,
        ...Object.entries(shares).map(([userId, share]) => lp(userId, -share)),
      ],
    },
  }
}

const payoutsByUser = (
  state: {
    pool: { YES: number; NO: number }
    subsidyPool: number
    liquidities: LiquidityProvision[]
  },
  outcome: 'YES' | 'NO'
) =>
  Object.fromEntries(
    getLiquidityPoolPayouts(
      {
        pool: state.pool,
        subsidyPool: state.subsidyPool,
      } as unknown as CPMMContract,
      outcome,
      state.liquidities
    ).map(({ userId, payout }) => [userId, payout])
  )

describe('proportional liquidity withdrawal', () => {
  it('splits a withdrawal by each provider’s net contribution', () => {
    const liquidities = [lp('alice', 100), lp('bob', 900)]
    const shares = getLiquidityWithdrawalShares(liquidities, 500)
    expect(shares.alice).toBeCloseTo(50, 10)
    expect(shares.bob).toBeCloseTo(450, 10)
  })

  it('gives nothing to a provider who has taken out more than they put in', () => {
    const liquidities = [lp('alice', 100), lp('bob', 1000), lp('alice', -1000)]
    const shares = getLiquidityWithdrawalShares(liquidities, 300)
    expect(shares.alice).toBeUndefined()
    expect(shares.bob).toBeCloseTo(300, 10)
    expect(getLiquidityProvidersNetTotal(liquidities)).toBeCloseTo(1000, 10)
  })

  it('stops the creator taking liquidity someone else added', () => {
    // Alice opens with Ṁ100, Bob adds Ṁ1,000, which is still pending. Before,
    // Alice could withdraw all of Bob's Ṁ1,000; now she gets her share of it.
    const state = {
      pool: { YES: 100, NO: 100 },
      p: 0.5,
      subsidyPool: 1000,
      liquidities: [lp('alice', 100), lp('bob', 1000)],
    }
    const { shares } = withdraw(state, 1000)
    expect(shares.alice).toBeCloseTo(1000 / 11, 8)
    expect(shares.bob).toBeCloseTo(10000 / 11, 8)
  })

  it.each([
    ['pending subsidy only', 300],
    ['pending subsidy and the pool', 1100],
  ])(
    'leaves every provider with what they would have had in each outcome (%s)',
    (_, amount) => {
      // A traded pool at 70%, with some subsidy still pending, three providers
      // and a past withdrawal.
      const before = {
        pool: { YES: 900, NO: 2100 },
        p: 0.5,
        subsidyPool: 400,
        liquidities: [
          lp('alice', 1000),
          lp('bob', 1500),
          lp('carol', 600),
          lp('carol', -100),
        ],
      }
      const { shares, state: after } = withdraw(before, amount)
      expect(sumBy(Object.values(shares))).toBeCloseTo(amount, 8)

      // The pool loses exactly the amount withdrawn whichever way it resolves.
      for (const outcome of ['YES', 'NO'] as const) {
        const was = payoutsByUser(before, outcome)
        const now = payoutsByUser(after, outcome)
        for (const userId of ['alice', 'bob', 'carol']) {
          expect(now[userId] + shares[userId]).toBeCloseTo(was[userId], 6)
        }
      }
      // Nobody's share of what's left moved.
      const weightsBefore = getCpmmLiquidityPoolWeights(before.liquidities)
      const weightsAfter = getCpmmLiquidityPoolWeights(after.liquidities)
      for (const userId of ['alice', 'bob', 'carol'])
        expect(weightsAfter[userId]).toBeCloseTo(weightsBefore[userId], 12)
    }
  )

  it('keeps shares the same across repeated withdrawals', () => {
    let state = {
      pool: { YES: 6000, NO: 6000 },
      p: 0.5,
      subsidyPool: 0,
      liquidities: [lp('alice', 1000), lp('bob', 9000)],
    }
    for (let i = 0; i < 5; i++) {
      const result = withdraw(state, 1000)
      expect(result.shares.alice).toBeCloseTo(100, 8)
      expect(result.shares.bob).toBeCloseTo(900, 8)
      state = result.state
    }
  })
})
