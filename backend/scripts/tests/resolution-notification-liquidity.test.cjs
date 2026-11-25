// Pairing old resolution notifications with their resolutions:
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
const getNotificationFixes = (notifications, payouts, undos = [], since = 0) =>
  JSON.parse(
    JSON.stringify(
      loaded.getNotificationFixes(notifications, payouts, undos, since)
    )
  )

const T0 = Date.parse('2026-11-25T04:01:25.206Z')
const MINUTE = 60_000
const payout = (over) => ({
  userId: 'gen',
  contractId: 'dwts',
  answerId: null,
  createdTime: T0,
  deposit: 356.88,
  ...over,
})
// Someone else paid in a resolution
const other = (over) => payout({ userId: 'other', deposit: 0, ...over })
const notification = (over) => ({
  userId: 'gen',
  notificationId: 'n1',
  contractId: 'dwts',
  answerId: null,
  createdTime: T0 + 1478,
  outcome: '6RCqntZh6l',
  userPayout: 356.88,
  ...over,
})
const undo = (over) => ({
  contractId: 'dwts',
  answerId: null,
  anyAnswer: false,
  createdTime: T0 + 2 * MINUTE,
  ...over,
})
const ids = (rows) => rows.map((r) => (r.notification ?? r).notificationId)

test('moves the liquidity share out of userPayout', () => {
  // The case that found the bug: a M$5 losing bet plus a subsidy that paid
  // back M$356.88, notified as a payout of M$356.88.
  const { fixes, doubtful } = getNotificationFixes(
    [notification()],
    [payout(), other()]
  )
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

test('when the market resolved twice within the hour, fixes only the notification written before the second', () => {
  // Resolved, unresolved and resolved again 3.7 minutes later (seen on prod
  // 23 Nov), one notification after each. The first was written before the
  // second resolution began, so it can only be the first's; the second
  // could be either.
  const { fixes, doubtful } = getNotificationFixes(
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
    [
      payout({ deposit: 0.8665 }),
      payout({ createdTime: T0 + 221_796, deposit: 5.009 }),
    ]
  )
  assert.deepEqual(
    fixes.map((f) => [f.notificationId, f.userLiquidityPayout]),
    [['a', 0.8665]]
  )
  assert.deepEqual(ids(doubtful), ['b'])
})

test("a later resolution that didn't pay the user still makes it doubtful", () => {
  // Cancelled (M$30 of withdrawn liquidity taken back), then resolved YES
  // 3.7 minutes later, paying others but not this user: the YES
  // notification must not take the cancellation's share.
  const { fixes, doubtful } = getNotificationFixes(
    [
      notification({
        createdTime: T0 + 223_000,
        outcome: 'YES',
        userPayout: 0,
      }),
    ],
    [payout({ deposit: -30 }), other({ createdTime: T0 + 221_796 })]
  )
  assert.deepEqual(fixes, [])
  assert.equal(doubtful.length, 1)
})

test('leaves a chain of resolutions alone', () => {
  // Three resolutions six minutes apart, each notification written just
  // after the next resolution began.
  const { fixes, doubtful } = getNotificationFixes(
    [
      notification({
        notificationId: 'a',
        createdTime: T0 + 6 * MINUTE + 500,
      }),
      notification({
        notificationId: 'b',
        createdTime: T0 + 12 * MINUTE + 500,
      }),
    ],
    [
      payout({ deposit: 10 }),
      payout({ createdTime: T0 + 6 * MINUTE, deposit: 20 }),
      payout({ createdTime: T0 + 12 * MINUTE, deposit: 30 }),
    ]
  )
  assert.deepEqual(fixes, [])
  assert.deepEqual(ids(doubtful), ['a', 'b'])
})

test('a resolution over an hour before is not in the way', () => {
  const { fixes, doubtful } = getNotificationFixes(
    [notification({ createdTime: T0 + 61 * MINUTE + 1478 })],
    [payout({ deposit: 5 }), payout({ createdTime: T0 + 61 * MINUTE })]
  )
  assert.deepEqual(doubtful, [])
  assert.deepEqual(
    fixes.map((f) => f.userLiquidityPayout),
    [356.88]
  )
})

test('nothing to do when no nearby resolution paid the liquidity', () => {
  const { fixes, doubtful } = getNotificationFixes(
    [notification({ createdTime: T0 + 2 * MINUTE, userPayout: 10 })],
    [payout({ deposit: 0 }), other({ createdTime: T0 + MINUTE })]
  )
  assert.deepEqual(fixes, [])
  assert.deepEqual(doubtful, [])
})

test('matches only the same user, market and answer', () => {
  const { fixes } = getNotificationFixes(
    [
      notification({ notificationId: 'other-answer', answerId: 'a2' }),
      notification({ notificationId: 'other-user', userId: 'someone' }),
      notification({ notificationId: 'other-market', contractId: 'x' }),
    ],
    [payout({ answerId: 'a1' }), payout(), other({ contractId: 'x' })]
  )
  assert.deepEqual(fixes, [])
})

test('needs the resolution before the notification, and within ten minutes', () => {
  const { fixes, doubtful } = getNotificationFixes(
    [
      notification({ notificationId: 'before', createdTime: T0 - 5000 }),
      notification({ notificationId: 'late', createdTime: T0 + 11 * MINUTE }),
    ],
    [payout()]
  )
  assert.deepEqual(fixes, [])
  assert.deepEqual(ids(doubtful), ['late'])
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
  assert.deepEqual(ids(doubtful), ['resolved'])
  // A cancelled market refunds trades, which can be negative after sales.
  assert.deepEqual(
    fixes.map((f) => [f.notificationId, f.userPayout]),
    [['cancelled', -200]]
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

test('a resolution that paid no one, after an unresolve, is not given the earlier share', () => {
  // M$30 of liquidity paid, unresolved two minutes later (its payouts taken
  // back), then cancelled paying no one: that leaves no payouts, so the only
  // payout in the hour is the undone one.
  const { fixes, doubtful } = getNotificationFixes(
    [
      notification({
        createdTime: T0 + 3 * MINUTE,
        outcome: 'CANCEL',
        userPayout: 0,
      }),
    ],
    [payout({ deposit: 30 })],
    [undo()]
  )
  assert.deepEqual(fixes, [])
  assert.equal(doubtful.length, 1)
})

test('an undo whose payout is unknown counts for every answer', () => {
  const { fixes, doubtful } = getNotificationFixes(
    [notification({ answerId: 'a1', createdTime: T0 + 3 * MINUTE })],
    [payout({ answerId: 'a1' })],
    [undo({ anyAnswer: true })]
  )
  assert.deepEqual(fixes, [])
  assert.equal(doubtful.length, 1)
})

test('an unresolve after the notification is no reason to leave it', () => {
  const { fixes, doubtful } = getNotificationFixes(
    [notification()],
    [payout()],
    [undo(), undo({ answerId: 'other-answer', createdTime: T0 + 1000 })]
  )
  assert.deepEqual(doubtful, [])
  assert.equal(fixes.length, 1)
})

test('leaves resolutions before --since alone', () => {
  // Paid at 23:58, notified at 23:59:59.8, with --since at midnight
  const midnight = T0 + 2 * MINUTE
  const { fixes, doubtful } = getNotificationFixes(
    [notification({ createdTime: midnight - 200 })],
    [payout()],
    [],
    midnight
  )
  assert.deepEqual(fixes, [])
  assert.deepEqual(doubtful, [])
})
