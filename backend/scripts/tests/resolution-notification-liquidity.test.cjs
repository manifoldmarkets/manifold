// Pairing old resolution notifications with their payouts:
// node --test backend/scripts/tests/resolution-notification-liquidity.test.cjs
const assert = require('node:assert/strict')
const { test } = require('node:test')
const lodash = require('lodash')
const { load } = require('./load-ts.cjs')
const loaded = load('backend/scripts/resolution-notification-liquidity.ts', {
  lodash,
})
// The module runs in its own VM context: copy its results into this one so
// strict deep equality compares values, not array prototypes.
const getNotificationFixes = (...args) =>
  JSON.parse(JSON.stringify(loaded.getNotificationFixes(...args)))

const T0 = Date.parse('2026-11-25T04:01:25.206Z')
let nextId = 0
const payout = (over) => ({
  id: `p${nextId++}`,
  userId: 'gen',
  contractId: 'dwts',
  answerId: null,
  createdTime: T0,
  deposit: 356.88,
  ...over,
})
const notification = (over) => ({
  userId: 'gen',
  notificationId: 'n1',
  contractId: 'dwts',
  answerId: null,
  createdTime: T0 + 1478,
  outcome: '6RCqntZh6l',
  userPayout: 356.88,
  fixed: false,
  ...over,
})

test('moves the liquidity share out of userPayout', () => {
  // The case that found the bug: a M$5 losing bet plus a subsidy that paid
  // back M$356.88, notified as a payout of M$356.88.
  const { fixes, doubtful } = getNotificationFixes([notification()], [payout()])
  assert.deepEqual(doubtful, [])
  assert.deepEqual(fixes, [
    {
      userId: 'gen',
      notificationId: 'n1',
      oldUserPayout: 356.88,
      userPayout: 0,
      userLiquidityPayout: 356.88,
    },
  ])
})

test('keeps what the trades paid', () => {
  const { fixes } = getNotificationFixes(
    [notification({ userPayout: 2609.63 })],
    [payout({ deposit: 118.96 })]
  )
  assert.equal(fixes.length, 1)
  assert.ok(Math.abs(fixes[0].userPayout - (2609.63 - 118.96)) < 1e-9)
  assert.equal(fixes[0].userLiquidityPayout, 118.96)
})

test('pairs each notification with its own resolution when re-resolved', () => {
  // Resolved, unresolved and resolved again 3.7 minutes later (seen on prod
  // 23 Nov): two payouts and two notifications, each within ten minutes of
  // both payouts.
  const first = payout({ createdTime: T0, deposit: 0.8665 })
  const second = payout({ createdTime: T0 + 221_796, deposit: 5.009 })
  const { fixes } = getNotificationFixes(
    [
      notification({
        notificationId: 'a',
        createdTime: T0 + 434,
        userPayout: 0.8665,
      }),
      notification({
        notificationId: 'b',
        createdTime: T0 + 222_841,
        userPayout: 5.009,
      }),
    ],
    [first, second]
  )
  assert.deepEqual(
    fixes.map((f) => [f.notificationId, f.userLiquidityPayout, f.userPayout]),
    [
      ['a', 0.8665, 0],
      ['b', 5.009, 0],
    ]
  )
})

test("a later resolution that paid the liquidity nothing isn't mistaken for an earlier one", () => {
  const { fixes } = getNotificationFixes(
    [notification({ createdTime: T0 + 60_000, userPayout: 10 })],
    [payout({ deposit: 50 }), payout({ createdTime: T0 + 59_000, deposit: 0 })]
  )
  assert.deepEqual(fixes, [])
})

test('matches only the same user, market and answer', () => {
  const { fixes } = getNotificationFixes(
    [
      notification({ notificationId: 'other-answer', answerId: 'a2' }),
      notification({ notificationId: 'other-user', userId: 'someone' }),
      notification({ notificationId: 'other-market', contractId: 'x' }),
    ],
    [payout({ answerId: 'a1' }), payout()]
  )
  assert.deepEqual(fixes, [])
})

test('ignores payouts after the notification or too long before it', () => {
  const { fixes } = getNotificationFixes(
    [
      notification({ notificationId: 'before', createdTime: T0 - 5000 }),
      notification({ notificationId: 'late', createdTime: T0 + 11 * 60_000 }),
    ],
    [payout()]
  )
  assert.deepEqual(fixes, [])
})

test('allows a second of clock difference between the two', () => {
  const { fixes } = getNotificationFixes(
    [notification({ createdTime: T0 - 400 })],
    [payout()]
  )
  assert.equal(fixes.length, 1)
})

test('leaves a stored payout below the liquidity share alone, unless cancelled', () => {
  const { fixes, doubtful } = getNotificationFixes(
    [
      notification({ notificationId: 'resolved', userPayout: 100 }),
      notification({
        notificationId: 'cancelled',
        userPayout: 100,
        outcome: 'CANCEL',
        answerId: 'a',
      }),
    ],
    [payout({ deposit: 300 }), payout({ answerId: 'a', deposit: 300 })]
  )
  assert.deepEqual(
    doubtful.map((d) => d.notification.notificationId),
    ['resolved']
  )
  // A cancelled market refunds trades, which can be negative after sales.
  assert.deepEqual(
    fixes.map((f) => [f.notificationId, f.userPayout]),
    [['cancelled', -200]]
  )
})

test('leaves notifications alone when both come after the second payout', () => {
  // The first resolution's notification was written after the market had
  // been unresolved and resolved again: both notifications fall after the
  // second payout, so neither can be placed by time. (The first payout is
  // outside their window, so only the shared payout gives this away.)
  const { fixes, doubtful } = getNotificationFixes(
    [
      notification({
        notificationId: 'first',
        createdTime: T0 + 661_000,
        userPayout: 100,
      }),
      notification({
        notificationId: 'second',
        createdTime: T0 + 662_000,
        userPayout: 100,
      }),
    ],
    [
      payout({ deposit: 40 }),
      payout({ createdTime: T0 + 660_000, deposit: 20 }),
    ]
  )
  assert.deepEqual(fixes, [])
  assert.deepEqual(
    doubtful.map((d) => d.notification.notificationId),
    ['first', 'second']
  )
})

test('leaves a notification alone when an earlier payout in its window has none', () => {
  // Only one notification survives, written after the second payout: it may
  // belong to either resolution.
  const { fixes, doubtful } = getNotificationFixes(
    [notification({ createdTime: T0 + 61_000, userPayout: 100 })],
    [payout({ deposit: 40 }), payout({ createdTime: T0 + 60_000, deposit: 20 })]
  )
  assert.deepEqual(fixes, [])
  assert.equal(doubtful.length, 1)
})

test('a notification fixed before still accounts for its own payout', () => {
  const { fixes, doubtful } = getNotificationFixes(
    [
      notification({
        notificationId: 'done',
        createdTime: T0 + 400,
        userPayout: 0,
        fixed: true,
      }),
      notification({
        notificationId: 'next',
        createdTime: T0 + 60_400,
        userPayout: 20,
      }),
    ],
    [payout({ deposit: 40 }), payout({ createdTime: T0 + 60_000, deposit: 20 })]
  )
  assert.deepEqual(doubtful, [])
  assert.deepEqual(
    fixes.map((f) => [f.notificationId, f.userPayout, f.userLiquidityPayout]),
    [['next', 0, 20]]
  )
})

test('moves a negative liquidity share on a cancelled market', () => {
  // Cancelling takes back liquidity the user had withdrawn: M$80 of trades
  // refunded, M$30 of withdrawn liquidity taken back, notified as M$50.
  const { fixes } = getNotificationFixes(
    [notification({ outcome: 'CANCEL', userPayout: 50 })],
    [payout({ deposit: -30 })]
  )
  assert.deepEqual(
    fixes.map((f) => [f.userPayout, f.userLiquidityPayout]),
    [[80, -30]]
  )
})
