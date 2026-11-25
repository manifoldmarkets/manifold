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
const run = ({
  notifications,
  payouts,
  current = [resolution()],
  unresolved = [],
}) =>
  JSON.parse(
    JSON.stringify(
      loaded.getNotificationFixes(
        notifications,
        payouts,
        current,
        new Set(unresolved)
      )
    )
  )

const T0 = Date.parse('2026-11-25T04:01:25.206Z')
const MINUTE = 60_000
function payout(over) {
  return {
    userId: 'gen',
    contractId: 'dwts',
    answerId: null,
    createdTime: T0,
    inPeriod: true,
    deposit: 356.88,
    ...over,
  }
}
// Someone else paid
const other = (over) => payout({ userId: 'other', deposit: 0, ...over })
function resolution(over) {
  return {
    contractId: 'dwts',
    answerId: null,
    resolution: '6RCqntZh6l',
    resolutionTime: T0 + 11,
    ...over,
  }
}
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
const ids = (rows) => rows.map((r) => (r.notification ?? r).notificationId)

test('moves the liquidity share out of userPayout', () => {
  // The case that found the bug: a M$5 losing bet plus a subsidy that paid
  // back M$356.88, notified as a payout of M$356.88.
  const { fixes, doubtful } = run({
    notifications: [notification()],
    payouts: [payout(), other()],
  })
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
  const { fixes } = run({
    notifications: [notification({ userPayout: 2609.63 })],
    payouts: [payout({ deposit: 118.96 })],
  })
  assert.equal(fixes.length, 1)
  assert.ok(Math.abs(fixes[0].userPayout - (2609.63 - 118.96)) < 1e-9)
  assert.equal(fixes[0].userLiquidityPayout, 118.96)
})

test('leaves a market that paid out more than once', () => {
  // Resolved, unresolved and resolved again, even a day apart
  const { fixes, doubtful } = run({
    notifications: [notification()],
    payouts: [payout(), other({ createdTime: T0 - 24 * 60 * MINUTE })],
  })
  assert.deepEqual(fixes, [])
  assert.equal(doubtful.length, 1)
})

test('leaves a market with any undone payout', () => {
  // Resolved and paid; unresolved (payouts taken back); cancelled paying no
  // one: only one resolution's payouts are left to see.
  const { fixes, doubtful } = run({
    notifications: [
      notification({ outcome: 'CANCEL', createdTime: T0 + 3 * MINUTE }),
    ],
    payouts: [payout({ deposit: 30 })],
    current: [
      resolution({ resolution: 'CANCEL', resolutionTime: T0 + 3 * MINUTE }),
    ],
    unresolved: ['dwts'],
  })
  assert.deepEqual(fixes, [])
  assert.equal(doubtful.length, 1)
})

test('leaves a market whose resolution time is not its payouts', () => {
  // An old unresolve that left no undo, then a resolution that paid no one:
  // the market's resolution is the later one.
  for (const current of [
    [resolution({ resolutionTime: T0 + 3 * MINUTE })],
    [resolution({ resolution: null, resolutionTime: null })],
    [],
  ]) {
    const { fixes, doubtful } = run({
      notifications: [notification()],
      payouts: [payout()],
      current,
    })
    assert.deepEqual(fixes, [])
    assert.equal(doubtful.length, 1)
  }
})

test('leaves a notification of another outcome than the market has', () => {
  const { fixes, doubtful } = run({
    notifications: [notification({ outcome: 'CANCEL' })],
    payouts: [payout()],
  })
  assert.deepEqual(fixes, [])
  assert.equal(doubtful.length, 1)
})

test('leaves both when the user has two resolution notifications on it', () => {
  // A delayed notification from a resolution that paid no one, next to the
  // one from the resolution that paid
  const { fixes, doubtful } = run({
    notifications: [
      notification({ notificationId: 'a' }),
      notification({ notificationId: 'b', createdTime: T0 + 2000 }),
    ],
    payouts: [payout()],
  })
  assert.deepEqual(fixes, [])
  assert.deepEqual(ids(doubtful), ['a', 'b'])
})

test("a fixed notification still counts as one of the user's", () => {
  const { fixes, doubtful } = run({
    notifications: [
      notification({ notificationId: 'a', fixed: true }),
      notification({ notificationId: 'b', createdTime: T0 + 2000 }),
    ],
    payouts: [payout()],
  })
  assert.deepEqual(fixes, [])
  assert.deepEqual(ids(doubtful), ['b'])
})

test('needs the notification within ten minutes after the resolution', () => {
  for (const createdTime of [T0 - 5000, T0 + 11 * MINUTE]) {
    const { fixes, doubtful } = run({
      notifications: [notification({ createdTime })],
      payouts: [payout()],
    })
    assert.deepEqual(fixes, [])
    assert.equal(doubtful.length, 1)
  }
})

test('allows a second of clock difference', () => {
  const { fixes } = run({
    notifications: [notification({ createdTime: T0 - 400 })],
    payouts: [payout()],
    current: [resolution({ resolutionTime: T0 - 400 })],
  })
  assert.equal(fixes.length, 1)
})

test('leaves resolutions before --since alone', () => {
  const { fixes, doubtful } = run({
    notifications: [notification()],
    payouts: [payout({ inPeriod: false })],
  })
  assert.deepEqual(fixes, [])
  assert.deepEqual(doubtful, [])
})

test('nothing to do when the liquidity was paid nothing', () => {
  const { fixes, doubtful } = run({
    notifications: [notification({ userPayout: 10 })],
    payouts: [payout({ deposit: 0 }), other()],
  })
  assert.deepEqual(fixes, [])
  assert.deepEqual(doubtful, [])
})

test('matches answers of a multiple choice market separately', () => {
  // Independent answers resolve one by one, seconds apart
  const { fixes, doubtful } = run({
    notifications: [
      notification({ notificationId: 'a1', answerId: 'a1', outcome: 'YES' }),
      notification({
        notificationId: 'a2',
        answerId: 'a2',
        outcome: 'NO',
        createdTime: T0 + 3000,
        userPayout: 20,
      }),
    ],
    payouts: [
      payout({ answerId: 'a1' }),
      payout({ answerId: 'a2', createdTime: T0 + 2000, deposit: 20 }),
    ],
    current: [
      resolution({ resolution: null, resolutionTime: null }),
      resolution({ answerId: 'a1', resolution: 'YES' }),
      resolution({
        answerId: 'a2',
        resolution: 'NO',
        resolutionTime: T0 + 2010,
      }),
    ],
  })
  assert.deepEqual(doubtful, [])
  assert.deepEqual(
    fixes.map((f) => [f.notificationId, f.userPayout, f.userLiquidityPayout]),
    [
      ['a1', 0, 356.88],
      ['a2', 0, 20],
    ]
  )
})

test('leaves a stored payout below the liquidity share alone, unless cancelled', () => {
  const cancelled = run({
    notifications: [notification({ outcome: 'CANCEL', userPayout: 100 })],
    payouts: [payout({ deposit: 300 })],
    current: [resolution({ resolution: 'CANCEL' })],
  })
  // A cancelled market refunds trades, which can be negative after sales.
  assert.deepEqual(
    cancelled.fixes.map((f) => f.userPayout),
    [-200]
  )
  const resolved = run({
    notifications: [notification({ userPayout: 100 })],
    payouts: [payout({ deposit: 300 })],
  })
  assert.deepEqual(resolved.fixes, [])
  assert.equal(resolved.doubtful.length, 1)
})

test('moves a negative liquidity share on a cancelled market', () => {
  // Cancelling takes back liquidity the user had withdrawn: M$80 of trades
  // refunded, M$30 of withdrawn liquidity taken back, notified as M$50.
  const { fixes } = run({
    notifications: [notification({ outcome: 'CANCEL', userPayout: 50 })],
    payouts: [payout({ deposit: -30 })],
    current: [resolution({ resolution: 'CANCEL' })],
  })
  assert.deepEqual(
    fixes.map((f) => [f.userPayout, f.userLiquidityPayout]),
    [[80, -30]]
  )
})

test('an undone payout on any answer of the market leaves it', () => {
  // Answer a1 resolved once, consistently; another answer was unresolved at
  // some point.
  const { fixes, doubtful } = run({
    notifications: [notification({ answerId: 'a1', outcome: 'YES' })],
    payouts: [payout({ answerId: 'a1' })],
    current: [resolution({ answerId: 'a1', resolution: 'YES' })],
    unresolved: ['dwts'],
  })
  assert.deepEqual(fixes, [])
  assert.equal(doubtful.length, 1)
})
