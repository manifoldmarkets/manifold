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
  // Whether analytics manages to store what it is given, or fails outright.
  const network = { stores: options.stores ?? true, throws: false }
  const events = []
  const logins = []
  // Retries the module has asked for: { delay, run }.
  const timers = []
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
          // The real track() adds to the object it is handed, and resolves
          // to whether the event was stored.
          properties.deviceId = 'added by track'
          return network.throws
            ? Promise.reject(new Error('analytics is down'))
            : Promise.resolve(network.stores)
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
      setTimeout: (run, delay) => timers.push({ delay, run }),
    }
  )
  return { lib, events, logins, local, session, clock, network, timers }
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
      firstSurface: 'ticket',
      sinceFirstPressMs: 0,
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
    enrolled: true,
    forced: false,
  })
  clock.now += 60_000
  assert.deepEqual(JSON.parse(JSON.stringify(lib.takePendingBet())), {
    contractId: 'c1',
    location: 'contract table',
    createdTime: START,
    outcome: 'NO',
    enrolled: true,
    forced: false,
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
      firstSurface: 'button',
      sinceFirstPressMs: 0,
    },
  ])
})

const exposuresOf = (f) => named(f.events, rules.SIGNED_OUT_BET_TEST)
const firstPressOf = (local) =>
  JSON.parse(local.getItem(rules.SIGNED_OUT_BET_FIRST_PRESS_KEY))
const unsentOf = (local) =>
  JSON.parse(local.getItem(rules.SIGNED_OUT_BET_UNSENT_KEY) ?? '[]')

test('every exposure says where the device first pressed and how long ago', async () => {
  const local = newStore()
  const pageOne = fixture({ local })
  pageOne.lib.onSignedOutBetPress(ticket('c1'))
  assert.equal(pageOne.events[0].firstSurface, 'ticket')
  assert.equal(pageOne.events[0].sinceFirstPressMs, 0)
  assert.deepEqual(firstPressOf(local), { time: START, surface: 'ticket' })
  await settle()

  // A page load forty minutes on logs its own exposure. It still began on a
  // market page, forty minutes ago.
  const pageTwo = fixture({ local })
  pageTwo.clock.now = START + 40 * 60_000
  pageTwo.lib.onSignedOutBetPress(button('c2'))
  assert.equal(pageTwo.events[0].name, rules.SIGNED_OUT_BET_TEST)
  assert.equal(pageTwo.events[0].surface, 'button')
  assert.equal(pageTwo.events[0].firstSurface, 'ticket')
  assert.equal(pageTwo.events[0].sinceFirstPressMs, 40 * 60_000)
  assert.deepEqual(firstPressOf(local), { time: START, surface: 'ticket' })
  await settle()

  // And two days on: that is how the report knows not to enroll it again.
  const pageThree = fixture({ local })
  pageThree.clock.now = START + 2 * 86_400_000
  pageThree.lib.onSignedOutBetPress(button('c3'))
  assert.equal(pageThree.events[0].sinceFirstPressMs, 2 * 86_400_000)

  // Cleared storage is a new device as far as anything can tell.
  const cleared = fixture()
  cleared.clock.now = START + 2 * 86_400_000
  cleared.lib.onSignedOutBetPress(button('c4'))
  assert.equal(cleared.events[0].firstSurface, 'button')
  assert.equal(cleared.events[0].sinceFirstPressMs, 0)
})

test('a browser clock that is wrong makes no difference to what an exposure says', async () => {
  // Four hours fast, then corrected between two page loads.
  const local = newStore()
  const fast = fixture({ local })
  fast.clock.now = START + 4 * 3_600_000
  fast.lib.onSignedOutBetPress(ticket('c1'))
  assert.equal(fast.events[0].sinceFirstPressMs, 0)
  await settle()
  const still = fixture({ local })
  still.clock.now = START + 4 * 3_600_000 + 10 * 60_000
  still.lib.onSignedOutBetPress(ticket('c2'))
  assert.equal(still.events[0].sinceFirstPressMs, 10 * 60_000)
  await settle()

  // Once the clock reads earlier than the first press did, the device no
  // longer says anything about its enrollment.
  const corrected = fixture({ local })
  corrected.clock.now = START + 20 * 60_000
  corrected.lib.onSignedOutBetPress(ticket('c3'))
  assert.equal(corrected.events[0].name, rules.SIGNED_OUT_BET_TEST)
  assert.equal('sinceFirstPressMs' in corrected.events[0], false)
  assert.equal('firstSurface' in corrected.events[0], false)
})

test('a first-press record that cannot be read is left alone, and the device says nothing', async () => {
  for (const stored of [
    '{not json',
    '"soon"',
    '1800000000000',
    'null',
    '',
    '{"time":"soon","surface":"ticket"}',
    '{"time":1800000000000}',
    '{"time":1800000000000,"surface":"page"}',
    '{"time":0,"surface":"ticket"}',
    '{"time":1800000000000,"surface":"ticket","qa":"yes"}',
  ]) {
    const local = newStore()
    local.setItem(rules.SIGNED_OUT_BET_FIRST_PRESS_KEY, stored)
    const f = fixture({ local, force: 'treatment' })
    f.lib.onSignedOutBetPress(ticket())
    assert.equal(f.events[0].name, rules.SIGNED_OUT_BET_TEST, stored)
    assert.equal('sinceFirstPressMs' in f.events[0], false, stored)
    assert.equal('firstSurface' in f.events[0], false, stored)
    // Not replaced by a fresh one, which would let the device start over.
    assert.equal(
      local.getItem(rules.SIGNED_OUT_BET_FIRST_PRESS_KEY),
      stored,
      stored
    )
  }
})

test('an exposure is kept until it is stored', async () => {
  const f = fixture({ stores: false })
  f.lib.onSignedOutBetPress(ticket('c1'))
  assert.equal(exposuresOf(f).length, 1)
  assert.equal(unsentOf(f.local).length, 1)
  await settle()
  // Not stored, so still kept.
  assert.deepEqual(unsentOf(f.local), [
    {
      key: unsentOf(f.local)[0].key,
      time: START,
      exposure: {
        variant: 'treatment',
        forced: false,
        location: 'bet panel',
        surface: 'ticket',
        contractId: 'c1',
        environment: 'production',
      },
    },
  ])

  f.network.stores = true
  f.clock.now += 1000
  f.lib.flushSignedOutBetExposures()
  await settle()
  assert.equal(exposuresOf(f).length, 2)
  assert.equal(f.local.getItem(rules.SIGNED_OUT_BET_UNSENT_KEY), null)
  // Nothing more to send.
  f.lib.flushSignedOutBetExposures()
  f.lib.onSignedOutBetPress(ticket('c1'))
  await settle()
  assert.equal(exposuresOf(f).length, 2)
})

test('a failed exposure is sent again on a timer, without another press', async () => {
  const f = fixture({ stores: false })
  f.lib.onSignedOutBetPress(ticket('c1'))
  await settle()
  assert.deepEqual(
    f.timers.map((t) => t.delay),
    [5_000]
  )

  // Five seconds on it fails again, this time outright.
  f.network.throws = true
  f.clock.now += 5_000
  f.timers[0].run()
  await settle()
  assert.equal(exposuresOf(f).length, 2)
  assert.deepEqual(
    f.timers.map((t) => t.delay),
    [5_000, 30_000]
  )

  // Thirty seconds after that it is stored. It still describes the press
  // that made it, and says how long ago the device first pressed.
  f.network.throws = false
  f.network.stores = true
  f.clock.now += 30_000
  f.timers[1].run()
  await settle()
  const sent = exposuresOf(f)
  assert.equal(sent.length, 3)
  assert.equal(sent[2].contractId, 'c1')
  assert.equal(sent[2].surface, 'ticket')
  assert.equal(sent[2].firstSurface, 'ticket')
  assert.equal(sent[2].sinceFirstPressMs, 35_000)
  assert.equal(f.local.getItem(rules.SIGNED_OUT_BET_UNSENT_KEY), null)
  assert.equal(f.timers.length, 2)
})

test('the timer gives up after three tries, and a press or a page load still sends', async () => {
  const local = newStore()
  const f = fixture({ local, stores: false })
  f.lib.onSignedOutBetPress(ticket('c1'))
  await settle()
  for (const timer of [0, 1, 2]) {
    f.timers[timer].run()
    await settle()
  }
  assert.deepEqual(
    f.timers.map((t) => t.delay),
    [5_000, 30_000, 120_000]
  )
  assert.equal(exposuresOf(f).length, 4)

  // No fourth timer. The next press tries again.
  f.lib.onSignedOutBetPress(button('c2'))
  await settle()
  assert.equal(exposuresOf(f).length, 5)
  assert.equal(f.timers.length, 3)

  // So does the next page load, before anything is pressed.
  const next = fixture({ local })
  next.clock.now = START + 10 * 60_000
  next.lib.flushSignedOutBetExposures()
  await settle()
  assert.equal(exposuresOf(next).length, 1)
  assert.equal(exposuresOf(next)[0].contractId, 'c1')
  assert.equal(exposuresOf(next)[0].sinceFirstPressMs, 10 * 60_000)
  assert.equal(local.getItem(rules.SIGNED_OUT_BET_UNSENT_KEY), null)
})

test('one exposure is never on its way twice', async () => {
  const f = fixture()
  f.lib.onSignedOutBetPress(ticket('c1'))
  // Still on its way: a second press, and a page asking for a flush, do not
  // send a second copy.
  f.lib.onSignedOutBetPress(ticket('c1', 'NO'))
  f.lib.flushSignedOutBetExposures()
  f.lib.flushSignedOutBetExposures()
  assert.equal(exposuresOf(f).length, 1)
  await settle()
  f.lib.flushSignedOutBetExposures()
  await settle()
  assert.equal(exposuresOf(f).length, 1)
  assert.equal(f.timers.length, 0)
})

test('an exposure that has waited an hour is dropped', async () => {
  const local = newStore()
  const f = fixture({ local, stores: false })
  f.lib.onSignedOutBetPress(ticket('c1'))
  await settle()
  const later = fixture({ local })
  later.clock.now = START + 3_600_000 - 1
  later.network.stores = false
  later.lib.flushSignedOutBetExposures()
  await settle()
  assert.equal(exposuresOf(later).length, 1)

  // An hour after its press it can no longer enroll the device.
  const tooLate = fixture({ local })
  tooLate.clock.now = START + 3_600_000
  tooLate.lib.flushSignedOutBetExposures()
  await settle()
  assert.equal(exposuresOf(tooLate).length, 0)
  assert.equal(local.getItem(rules.SIGNED_OUT_BET_UNSENT_KEY), null)
})

test('unsent exposures that cannot be read are dropped, not sent', async () => {
  for (const stored of [
    '{not json',
    'null',
    '{}',
    '[{"key":"k","time":1800000000000}]',
    '[{"key":"k","time":1800000000000,"exposure":{"variant":"both"}}]',
    '[{"key":"","time":1800000000000,"exposure":{"variant":"control","forced":false,"location":"x","surface":"ticket","contractId":"c","environment":"production"}}]',
  ]) {
    const local = newStore()
    local.setItem(rules.SIGNED_OUT_BET_UNSENT_KEY, stored)
    const f = fixture({ local })
    f.lib.flushSignedOutBetExposures()
    await settle()
    assert.deepEqual(f.events, [], stored)
    assert.equal(local.getItem(rules.SIGNED_OUT_BET_UNSENT_KEY), null, stored)
  }
})

test('the switches drop what was waiting to be sent', async () => {
  for (const mode of ['off', 'on']) {
    const local = newStore()
    const before = fixture({ local, stores: false })
    before.lib.onSignedOutBetPress(ticket('c1'))
    await settle()
    assert.equal(unsentOf(local).length, 1)
    const after = fixture({ local, mode })
    after.lib.flushSignedOutBetExposures()
    await settle()
    assert.deepEqual(after.events, [], mode)
    assert.equal(local.getItem(rules.SIGNED_OUT_BET_UNSENT_KEY), null, mode)
  }
})

test('QA use is remembered on the device, and said on every exposure after it', async () => {
  const control = tokenFor('control')
  const local = newStore()
  const forced = fixture({ local, deviceToken: control, force: 'treatment' })
  forced.lib.onSignedOutBetPress(ticket('c1'))
  assert.equal(forced.events[0].forced, true)
  assert.deepEqual(firstPressOf(local), {
    time: START,
    surface: 'ticket',
    qa: true,
  })
  await settle()

  // The override is cleared. The device is back in its own variant, and
  // still says it has been used for QA.
  local.removeItem(rules.SIGNED_OUT_BET_FORCE_KEY)
  const after = fixture({ local, deviceToken: control })
  after.clock.now = START + 20 * 60_000
  after.lib.onSignedOutBetPress(ticket('c2'))
  assert.equal(after.events[0].variant, 'control')
  assert.equal(after.events[0].forced, true)

  // Used for QA only after it began: the record learns of it then.
  const late = newStore()
  const ordinary = fixture({ local: late, deviceToken: control })
  ordinary.lib.onSignedOutBetPress(ticket('c1'))
  assert.equal(ordinary.events[0].forced, false)
  await settle()
  late.setItem(rules.SIGNED_OUT_BET_FORCE_KEY, 'control')
  const qa = fixture({ local: late, deviceToken: control })
  qa.lib.onSignedOutBetPress(ticket('c2'))
  assert.equal(qa.events[0].forced, true)
  assert.deepEqual(firstPressOf(late), {
    time: START,
    surface: 'ticket',
    qa: true,
  })
})

test('a QA override switched on mid-page is logged, not hidden by the first exposure', () => {
  const control = tokenFor('control')
  const { lib, events, local } = fixture({ deviceToken: control })
  lib.onSignedOutBetPress(ticket('c1'))
  lib.onSignedOutBetPress(ticket('c1'))
  assert.equal(named(events, rules.SIGNED_OUT_BET_TEST).length, 1)
  // QA pins the same variant the device already had: no sign-in window
  // follows a control ticket press, so the exposure is the only trace.
  local.setItem(rules.SIGNED_OUT_BET_FORCE_KEY, 'control')
  lib.onSignedOutBetPress(ticket('c1'))
  lib.onSignedOutBetPress(ticket('c1'))
  const exposures = named(events, rules.SIGNED_OUT_BET_TEST)
  assert.equal(exposures.length, 2)
  assert.equal(exposures[0].forced, false)
  assert.equal(exposures[1].forced, true)
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

  // A forced row press says so on the bet it remembers.
  const row = fixture({ deviceToken: control, force: 'treatment' })
  row.lib.onSignedOutBetPress(button('c1'))
  const bet = row.lib.takePendingBet()
  assert.equal(bet.enrolled, true)
  assert.equal(bet.forced, true)
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

test('a bet remembered during the test reopens unreported once rolled out', () => {
  const session = newStore()
  const before = fixture({ session })
  before.lib.onSignedOutBetPress(button('c1', 'YES'))
  assert.equal(
    JSON.parse(session.getItem(rules.PENDING_BET_KEY)).enrolled,
    true
  )
  // The next page load runs the build that gives everyone the behaviour.
  const after = fixture({ session, mode: 'on' })
  assert.deepEqual(JSON.parse(JSON.stringify(after.lib.takePendingBet())), {
    contractId: 'c1',
    location: 'contract table',
    createdTime: START,
    outcome: 'YES',
  })
})

test('the kill switch also drops a bet remembered just before it', () => {
  const session = newStore()
  const before = fixture({ session })
  before.lib.onSignedOutBetPress(button('c1', 'YES'))
  assert.notEqual(session.getItem(rules.PENDING_BET_KEY), null)
  // The next page load runs the build with the switch thrown.
  const after = fixture({ session, mode: 'off' })
  assert.equal(after.lib.takePendingBet(), undefined)
  assert.equal(session.getItem(rules.PENDING_BET_KEY), null)
})

test('rolled out, everyone gets the new behaviour and nothing is logged', async () => {
  const { lib, events, logins } = fixture({ variant: 'control', mode: 'on' })
  lib.onSignedOutBetPress(ticket())
  assert.equal(logins.length, 1)
  lib.onSignedOutBetPress(button('c2', 'NO'))
  assert.equal(logins.length, 2)
  logins[1].resolve({ user: {} })
  await settle()
  // Not part of a test any more, so its ticket reopening is not reported.
  assert.deepEqual(JSON.parse(JSON.stringify(lib.takePendingBet())), {
    contractId: 'c2',
    location: 'contract table',
    createdTime: START,
    outcome: 'NO',
  })
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
