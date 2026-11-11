// What a signed-out bet press does, without a browser or a network:
// node --test backend/scripts/tests/signed-out-bet.test.cjs
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { load } = require('./load-ts.cjs')
const random = load('common/src/util/random.ts', {})
const abTest = load('common/src/ab-test.ts', { './util/random': random })
const rules = load('common/src/signed-out-bet.ts', { './ab-test': abTest })
const json = load('common/src/util/json.ts', {})

const START = 1_800_000_000_000

function newStore() {
  const values = new Map()
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  }
}

// A device token the experiment puts in the given variant.
function tokenFor(variant) {
  for (let i = 0; i < 1000; i++) {
    const deviceToken = `device-${i}`
    const assigned = rules.getSignedOutBetAssignment({
      deviceToken,
      mode: 'experiment',
    })
    if (assigned.variant === variant) return deviceToken
  }
  throw new Error(`no ${variant} token`)
}

function fixture(options = {}) {
  const {
    variant = 'treatment',
    native = false,
    storage = true,
    mode,
    force,
    hostname = 'manifold.markets',
    local = newStore(),
    session = newStore(),
  } = options
  if (force) local.setItem(rules.SIGNED_OUT_BET_FORCE_KEY, force)
  const clock = { now: START }
  const events = []
  const logins = []
  const lib = load(
    'web/lib/util/signed-out-bet.ts',
    {
      'common/signed-out-bet': rules,
      'common/util/json': json,
      'web/lib/firebase/users': {
        firebaseLogin: () =>
          new Promise((resolve, reject) => logins.push({ resolve, reject })),
      },
      'web/lib/native/is-native': { getIsNative: () => native },
      'web/lib/service/analytics': {
        track: (name, properties) => {
          events.push({ name, ...properties })
          // The real track() adds to the object it is handed.
          properties.deviceId = 'added by track'
        },
      },
      'web/lib/util/device-token': {
        ensureDeviceToken: () => options.deviceToken ?? tokenFor(variant),
      },
      'web/lib/util/local': {
        safeLocalStorage: storage ? local : undefined,
        safeSessionStorage: storage ? session : undefined,
      },
    },
    {
      window: { location: { hostname } },
      process: { env: { NEXT_PUBLIC_SIGNED_OUT_BET_SIGNIN: mode } },
      Date: { now: () => clock.now },
    }
  )
  return { lib, events, logins, local, session, clock }
}

const ticket = (contractId = 'c1', outcome = 'YES') => ({
  contractId,
  location: 'bet panel',
  surface: 'ticket',
  outcome,
})
const button = (contractId = 'c1', outcome) => ({
  contractId,
  location: 'contract table',
  surface: 'button',
  ...(outcome ? { outcome } : {}),
})
const named = (events, name) => events.filter((e) => e.name === name)
const settle = () => new Promise((resolve) => setImmediate(resolve))

test('control leaves a market page ticket alone', () => {
  const { lib, events, logins, session } = fixture({ variant: 'control' })
  lib.onSignedOutBetPress(ticket())
  lib.onSignedOutBetPress(ticket('c1', 'NO'))
  assert.equal(logins.length, 0)
  assert.equal(session.values.size, 0)
  assert.equal(lib.takePendingBet(), undefined)
  assert.deepEqual(events, [
    {
      name: rules.SIGNED_OUT_BET_TEST,
      variant: 'control',
      forced: false,
      location: 'bet panel',
      surface: 'ticket',
      contractId: 'c1',
      environment: 'production',
      assignmentUnit: 'device',
    },
  ])
})

test('control keeps a row button as it was: sign-in, and nothing after it', () => {
  const { lib, events, logins, session } = fixture({ variant: 'control' })
  lib.onSignedOutBetPress(button())
  lib.onSignedOutBetPress(button('c2'))
  assert.equal(logins.length, 2)
  assert.equal(session.values.size, 0)
  assert.equal(lib.takePendingBet(), undefined)
  assert.equal(named(events, rules.SIGNED_OUT_BET_TEST).length, 1)
})

test('treatment opens sign-in from a ticket once per tab', () => {
  const session = newStore()
  const { lib, logins } = fixture({ session })
  lib.onSignedOutBetPress(ticket('c1', 'YES'))
  assert.equal(logins.length, 1)
  // Switching sides, reopening the ticket, or another market: no second ask.
  lib.onSignedOutBetPress(ticket('c1', 'NO'))
  lib.onSignedOutBetPress({ ...ticket('c1'), location: 'answer panel' })
  lib.onSignedOutBetPress(ticket('c2'))
  assert.equal(logins.length, 1)
  // A ticket stays open through sign-in, so no bet is remembered.
  assert.equal(session.getItem(rules.PENDING_BET_KEY), null)
  assert.equal(lib.takePendingBet(), undefined)

  // The same tab after a reload still counts as asked.
  const reloaded = fixture({ session })
  reloaded.lib.onSignedOutBetPress(ticket('c3'))
  assert.equal(reloaded.logins.length, 0)

  // A new tab is a new visit.
  const newTab = fixture()
  newTab.lib.onSignedOutBetPress(ticket('c3'))
  assert.equal(newTab.logins.length, 1)
})

test('a row press that opened sign-in counts as the one ask', () => {
  const { lib, logins } = fixture()
  lib.onSignedOutBetPress(button('c1'))
  assert.equal(logins.length, 1)
  lib.onSignedOutBetPress(ticket('c2'))
  assert.equal(logins.length, 1)
  // Row buttons have nothing else to do, so they keep asking.
  lib.onSignedOutBetPress(button('c3'))
  assert.equal(logins.length, 2)
})

test('treatment remembers a row bet and hands it back once', () => {
  const { lib, logins, session, clock } = fixture()
  let notified = 0
  const unsubscribe = lib.subscribeSignedOutBet(() => notified++)
  const before = lib.getSignedOutBetVersion()
  lib.onSignedOutBetPress(button('c1', 'NO'))
  assert.equal(logins.length, 1)
  assert.equal(notified, 1)
  assert.equal(lib.getSignedOutBetVersion(), before + 1)
  assert.deepEqual(JSON.parse(session.getItem(rules.PENDING_BET_KEY)), {
    contractId: 'c1',
    location: 'contract table',
    createdTime: START,
    outcome: 'NO',
  })
  clock.now += 60_000
  assert.deepEqual(JSON.parse(JSON.stringify(lib.takePendingBet())), {
    contractId: 'c1',
    location: 'contract table',
    createdTime: START,
    outcome: 'NO',
  })
  assert.equal(session.getItem(rules.PENDING_BET_KEY), null)
  assert.equal(lib.takePendingBet(), undefined)
  unsubscribe()
  lib.onSignedOutBetPress(button('c1'))
  assert.equal(notified, 1)
})

test('the latest row press wins, and every press asks for sign-in', () => {
  const { lib, logins } = fixture()
  lib.onSignedOutBetPress(button('c1', 'YES'))
  lib.onSignedOutBetPress(button('c2'))
  assert.equal(logins.length, 2)
  const bet = lib.takePendingBet()
  assert.equal(bet.contractId, 'c2')
  assert.equal(bet.outcome, undefined)
})

test('a remembered bet expires', () => {
  const { lib, session, clock } = fixture()
  lib.onSignedOutBetPress(button())
  clock.now += rules.PENDING_BET_TTL_MS
  assert.equal(lib.takePendingBet(), undefined)
  assert.equal(session.getItem(rules.PENDING_BET_KEY), null)
})

test('a remembered bet survives a sign-in that reloads the page', () => {
  const session = newStore()
  const first = fixture({ session })
  first.lib.onSignedOutBetPress(button('c9', 'YES'))
  // A fresh page load: new module state, same tab storage.
  const second = fixture({ session })
  assert.equal(second.lib.takePendingBet().contractId, 'c9')
  assert.equal(session.getItem(rules.PENDING_BET_KEY), null)
  assert.equal(fixture({ session }).lib.takePendingBet(), undefined)
})

test('unusable stored values are dropped, not reopened', () => {
  for (const stored of [
    '{not json',
    'null',
    '"c1"',
    JSON.stringify({ contractId: 'c1' }),
    JSON.stringify({
      contractId: 'c1',
      location: 'contract table',
      createdTime: START - rules.PENDING_BET_TTL_MS - 1,
    }),
  ]) {
    const session = newStore()
    session.setItem(rules.PENDING_BET_KEY, stored)
    const { lib } = fixture({ session })
    assert.equal(lib.takePendingBet(), undefined, stored)
    assert.equal(session.getItem(rules.PENDING_BET_KEY), null, stored)
  }
})

test('the exposure is logged once per page load, with its own object', () => {
  const { lib, events } = fixture()
  lib.onSignedOutBetPress(button('c1', 'YES'))
  lib.onSignedOutBetPress(ticket('c2'))
  lib.onSignedOutBetPress(button('c3'))
  assert.deepEqual(named(events, rules.SIGNED_OUT_BET_TEST), [
    {
      name: rules.SIGNED_OUT_BET_TEST,
      variant: 'treatment',
      forced: false,
      location: 'contract table',
      surface: 'button',
      contractId: 'c1',
      environment: 'production',
      assignmentUnit: 'device',
    },
  ])
})

test('preview and localhost presses are labelled so', () => {
  for (const [hostname, environment] of [
    ['manifold.markets', 'production'],
    ['www.manifold.markets', 'production'],
    ['dev.manifold.markets', 'preview'],
    ['prod-git-main-mantic.vercel.app', 'preview'],
    ['localhost', 'local'],
    ['127.0.0.1', 'local'],
  ]) {
    const { lib, events } = fixture({ hostname })
    lib.onSignedOutBetPress(button())
    assert.equal(events[0].environment, environment, hostname)
  }
})

test('sign-in outcomes are reported and never left unhandled', async () => {
  const { lib, events, logins, clock } = fixture()
  // The ticket goes first: it only asks while nothing else has.
  lib.onSignedOutBetPress(ticket('c2'))
  lib.onSignedOutBetPress(button('c1', 'YES'))
  lib.onSignedOutBetPress(button('c3'))
  clock.now += 4000
  logins[1].reject({ code: 'auth/popup-closed-by-user' })
  logins[0].resolve({ user: {} })
  logins[2].reject(new Error('no code'))
  await settle()
  assert.deepEqual(named(events, rules.SIGNED_OUT_BET_SIGN_IN_EVENT), [
    {
      name: rules.SIGNED_OUT_BET_SIGN_IN_EVENT,
      variant: 'treatment',
      forced: false,
      location: 'contract table',
      surface: 'button',
      contractId: 'c1',
      environment: 'production',
      result: 'not-completed',
      code: 'auth/popup-closed-by-user',
      ms: 4000,
    },
    {
      name: rules.SIGNED_OUT_BET_SIGN_IN_EVENT,
      variant: 'treatment',
      forced: false,
      location: 'bet panel',
      surface: 'ticket',
      contractId: 'c2',
      environment: 'production',
      result: 'signed-in',
      code: undefined,
      ms: 4000,
    },
    {
      name: rules.SIGNED_OUT_BET_SIGN_IN_EVENT,
      variant: 'treatment',
      forced: false,
      location: 'contract table',
      surface: 'button',
      contractId: 'c3',
      environment: 'production',
      result: 'not-completed',
      code: undefined,
      ms: 4000,
    },
  ])
})

test('a QA override pins the variant and is flagged', () => {
  const control = tokenFor('control')
  const forced = fixture({ deviceToken: control, force: 'treatment' })
  forced.lib.onSignedOutBetPress(ticket())
  assert.equal(forced.logins.length, 1)
  assert.equal(forced.events[0].variant, 'treatment')
  assert.equal(forced.events[0].forced, true)

  const junk = fixture({ deviceToken: control, force: 'everyone' })
  junk.lib.onSignedOutBetPress(ticket())
  assert.equal(junk.logins.length, 0)
  assert.equal(junk.events[0].variant, 'control')
  assert.equal(junk.events[0].forced, false)
})

test('the kill switch gives everyone the old behaviour and logs nothing', async () => {
  const { lib, events, logins, session } = fixture({ mode: 'off' })
  lib.onSignedOutBetPress(ticket())
  assert.equal(logins.length, 0)
  lib.onSignedOutBetPress(button())
  assert.equal(logins.length, 1)
  logins[0].reject({ code: 'auth/popup-blocked' })
  await settle()
  assert.equal(session.values.size, 0)
  assert.deepEqual(events, [])
})

test('rolled out, everyone gets the new behaviour and nothing is logged', async () => {
  const { lib, events, logins } = fixture({ variant: 'control', mode: 'on' })
  lib.onSignedOutBetPress(ticket())
  assert.equal(logins.length, 1)
  lib.onSignedOutBetPress(button('c2', 'NO'))
  assert.equal(logins.length, 2)
  logins[1].resolve({ user: {} })
  await settle()
  assert.equal(lib.takePendingBet().contractId, 'c2')
  assert.deepEqual(events, [])
})

test('the native app keeps its own sign-in and stays out of the test', async () => {
  const { lib, events, logins, session } = fixture({ native: true })
  lib.onSignedOutBetPress(ticket())
  assert.equal(logins.length, 0)
  // Its row buttons still hand off to the native sign-in screen.
  lib.onSignedOutBetPress(button())
  assert.equal(logins.length, 1)
  logins[0].resolve(undefined)
  await settle()
  assert.equal(session.values.size, 0)
  assert.deepEqual(events, [])
})

test('a browser without storage has no stable variant, so it stays out', () => {
  const { lib, events, logins } = fixture({ storage: false })
  lib.onSignedOutBetPress(ticket())
  assert.equal(logins.length, 0)
  lib.onSignedOutBetPress(button())
  assert.equal(logins.length, 1)
  assert.equal(lib.takePendingBet(), undefined)
  assert.deepEqual(events, [])
})

test('the welcome steps report in and out', () => {
  const { lib } = fixture()
  const state = (userId) =>
    JSON.parse(JSON.stringify(lib.getWelcomeState(userId)))
  let notified = 0
  lib.subscribeSignedOutBet(() => notified++)
  assert.deepEqual(state('u1'), {
    welcomeMounted: false,
    welcomeFinished: false,
  })
  const unregister = lib.registerWelcome()
  const unregisterSecond = lib.registerWelcome()
  assert.deepEqual(state('u1'), {
    welcomeMounted: true,
    welcomeFinished: false,
  })
  unregisterSecond()
  assert.deepEqual(state('u1'), {
    welcomeMounted: true,
    welcomeFinished: false,
  })
  lib.markWelcomeFinished('u1')
  assert.deepEqual(state('u1'), { welcomeMounted: true, welcomeFinished: true })
  // Finishing is per account, and nobody signed in has finished anything.
  assert.deepEqual(state('u2'), {
    welcomeMounted: true,
    welcomeFinished: false,
  })
  assert.deepEqual(state(undefined), {
    welcomeMounted: true,
    welcomeFinished: false,
  })
  lib.markWelcomeFinished(undefined)
  assert.deepEqual(state(undefined), {
    welcomeMounted: true,
    welcomeFinished: false,
  })
  unregister()
  assert.deepEqual(state('u1'), {
    welcomeMounted: false,
    welcomeFinished: false,
  })
  assert.equal(notified, 6)
})
