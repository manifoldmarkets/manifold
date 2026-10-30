import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LimitBet } from 'common/bet'
import { ContractMetric } from 'common/contract-metric'
import { noFees } from 'common/fees'
import { getGameStake, mergeFullRefresh, sumGameStakes } from './game-positions'

const team = (answerId: string, prob: number) => ({
  answerId,
  name: answerId,
  shortName: answerId.slice(0, 3).toUpperCase(),
  flag: '',
  imageUrl: null,
  color: null,
  prob,
})
const versus = { home: team('home', 0.6), away: team('away', 0.4), draw: null }
const soccer = {
  home: team('home', 0.45),
  away: team('away', 0.3),
  draw: { answerId: 'draw', prob: 0.25 },
}

const metric = (
  answerId: string,
  totalShares: { YES?: number; NO?: number },
  invested: number,
  extra: Partial<ContractMetric> = {}
): ContractMetric => ({
  id: 1,
  userId: 'me',
  contractId: 'game',
  answerId,
  lastBetTime: 0,
  lastProb: null,
  hasNoShares: !!totalShares.NO,
  hasShares: true,
  hasYesShares: !!totalShares.YES,
  invested,
  loan: 0,
  marginLoan: 0,
  maxSharesOutcome: totalShares.YES ? 'YES' : 'NO',
  totalShares,
  totalSpent: undefined,
  payout: 0,
  totalAmountSold: 0,
  totalAmountInvested: invested,
  profit: 0,
  profitPercent: 0,
  from: undefined,
  ...extra,
})

let orderId = 0
const order = (
  answerId: string,
  outcome: 'YES' | 'NO',
  limitProb: number,
  orderAmount: number,
  filled = 0,
  extra: Partial<LimitBet> = {}
): LimitBet => ({
  id: `order-${++orderId}`,
  userId: 'me',
  contractId: 'game',
  answerId,
  createdTime: 0,
  amount: filled,
  outcome,
  shares: 0,
  probBefore: limitProb,
  probAfter: limitProb,
  fees: noFees,
  isRedemption: false,
  orderAmount,
  limitProb,
  isFilled: false,
  isCancelled: false,
  fills: [],
  ...extra,
})

const close = (actual: number, expected: number) =>
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `expected ${actual} to be ${expected}`
  )

test('YES shares on a team pay if it wins and are marked to its price', () => {
  const stake = getGameStake(versus, {
    metrics: [metric('home', { YES: 100 }, 60)],
    orders: [],
  })
  assert.ok(stake)
  close(stake.byAnswer.home.payoutIfWins, 100)
  close(stake.byAnswer.away.payoutIfWins, 0)
  close(stake.invested, 60)
  close(stake.value, 60) // 100 shares at 60%
  close(stake.profit, 0)
  assert.equal(stake.hasShares, true)
  assert.equal(stake.openOrders, 0)

  // The price moves: value and profit follow, the payout does not.
  const later = getGameStake(
    { ...versus, home: team('home', 0.7), away: team('away', 0.3) },
    { metrics: [metric('home', { YES: 100 }, 60)], orders: [] }
  )
  assert.ok(later)
  close(later.byAnswer.home.payoutIfWins, 100)
  close(later.value, 70)
  close(later.profit, 10)
})

test('NO shares on one of two teams back the other team', () => {
  // How the versus ticket stores a bet on the second team.
  const stake = getGameStake(versus, {
    metrics: [metric('home', { NO: 50 }, 20)],
    orders: [],
  })
  assert.ok(stake)
  close(stake.byAnswer.home.payoutIfWins, 0)
  close(stake.byAnswer.away.payoutIfWins, 50)
  close(stake.value, 20) // 50 NO shares at 1 - 60%
  close(stake.profit, 0)
})

test('in a three-way game, NO on a team pays if either other outcome wins', () => {
  const stake = getGameStake(soccer, {
    metrics: [metric('home', { NO: 30 }, 15), metric('draw', { YES: 10 }, 2.5)],
    orders: [],
  })
  assert.ok(stake)
  close(stake.byAnswer.home.payoutIfWins, 0)
  close(stake.byAnswer.away.payoutIfWins, 30)
  close(stake.byAnswer.draw.payoutIfWins, 40)
  close(stake.invested, 17.5)
  close(stake.value, 30 * 0.55 + 10 * 0.25)
})

test('open orders land on the outcome they back, at that side’s price', () => {
  const stake = getGameStake(versus, {
    metrics: [],
    orders: [
      // Backing the away team by selling the home team short, 40 of 100 filled.
      order('home', 'NO', 0.55, 100, 40),
      order('away', 'YES', 0.3, 20),
    ],
  })
  assert.ok(stake)
  assert.equal(stake.hasShares, false)
  assert.equal(stake.openOrders, 2)
  close(stake.unfilled, 80)
  assert.deepEqual(stake.byAnswer.home.orders, [])
  assert.deepEqual(stake.byAnswer.away.orders, [
    { amount: 60, prob: 0.45, against: false },
    { amount: 20, prob: 0.3, against: false },
  ])
})

test('a NO order in a three-way game stays on its outcome, marked against', () => {
  const stake = getGameStake(soccer, {
    metrics: [],
    orders: [order('home', 'NO', 0.55, 50)],
  })
  assert.ok(stake)
  assert.deepEqual(stake.byAnswer.home.orders, [
    { amount: 50, prob: 0.55, against: true },
  ])
  assert.deepEqual(stake.byAnswer.away.orders, [])
  assert.deepEqual(stake.byAnswer.draw.orders, [])
})

test('filled, cancelled, expired and fully filled orders are not open', () => {
  const now = 1_000_000
  const stake = getGameStake(
    versus,
    {
      metrics: [],
      orders: [
        order('home', 'YES', 0.5, 10, 0, { isFilled: true }),
        order('home', 'YES', 0.5, 10, 0, { isCancelled: true }),
        order('home', 'YES', 0.5, 10, 0, { expiresAt: now - 1 }),
        order('home', 'YES', 0.5, 10, 10),
        order('home', 'YES', 0.5, 10, 0, { expiresAt: now + 1 }),
      ],
    },
    now
  )
  assert.ok(stake)
  assert.equal(stake.openOrders, 1)
  close(stake.unfilled, 10)
})

test('nothing on the game, dust, other markets and non-finite values give no stake', () => {
  assert.equal(getGameStake(versus, undefined), undefined)
  assert.equal(getGameStake(versus, { metrics: [], orders: [] }), undefined)
  assert.equal(
    getGameStake(versus, {
      metrics: [metric('home', { YES: 0.2 }, 0.1)],
      orders: [],
    }),
    undefined
  )
  assert.equal(
    getGameStake(versus, {
      metrics: [
        metric('home', { YES: 100 }, 60, { hasShares: false }),
        metric('elsewhere', { YES: 100 }, 60),
        metric(null as unknown as string, { YES: 100 }, 60),
      ],
      orders: [order('elsewhere', 'YES', 0.5, 10)],
    }),
    undefined
  )
  const stake = getGameStake(versus, {
    metrics: [metric('home', { YES: NaN, NO: 40 }, Infinity)],
    orders: [order('away', 'YES', NaN, 10)],
  })
  assert.ok(stake)
  close(stake.byAnswer.away.payoutIfWins, 40)
  close(stake.invested, 0)
  assert.ok(Number.isFinite(stake.value))
  assert.ok(Number.isFinite(stake.profit))
  assert.deepEqual(stake.byAnswer.away.orders, [
    { amount: 10, prob: 0, against: false },
  ])
})

test('a sold-out answer keeps its realised profit in the game total', () => {
  // Bought the home side for Ṁ100, sold it all for Ṁ130, now holds away at cost.
  const stake = getGameStake(versus, {
    metrics: [
      metric('home', {}, 0, {
        hasShares: false,
        totalAmountInvested: 100,
        totalAmountSold: 130,
      }),
      metric('away', { YES: 50 }, 20),
    ],
    orders: [],
  })
  assert.ok(stake)
  close(stake.byAnswer.home.payoutIfWins, 0)
  close(stake.byAnswer.away.payoutIfWins, 50)
  close(stake.invested, 20)
  close(stake.value, 20)
  close(stake.profit, 30)
})

test('a full re-read keeps games updated after it started', () => {
  const held = { a: 'held-a', b: 'held-b', c: 'held-c' }
  const fetched = { a: 'fetched-a', b: 'fetched-b', d: 'fetched-d' }
  const touched = new Map([
    ['a', 150], // updated after the read started: keep
    ['b', 50], // updated before: the read is newer
  ])
  assert.deepEqual(
    mergeFullRefresh(held, fetched, ['a', 'b', 'c', 'd'], 100, touched),
    { a: 'held-a', b: 'fetched-b', d: 'fetched-d' }
  )
})

test('sumGameStakes adds up the filter’s games', () => {
  const a = getGameStake(versus, {
    metrics: [metric('home', { YES: 100 }, 60)],
    orders: [order('away', 'YES', 0.3, 20)],
  })
  const b = getGameStake(soccer, {
    metrics: [metric('draw', { YES: 10 }, 2)],
    orders: [],
  })
  assert.ok(a && b)
  const totals = sumGameStakes([a, b])
  assert.equal(totals.games, 2)
  close(totals.invested, 62)
  close(totals.value, 60 + 2.5)
  close(totals.profit, 0.5)
  assert.equal(totals.openOrders, 1)
})
