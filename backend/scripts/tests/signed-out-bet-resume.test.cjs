// ResumePendingBet mounted in a DOM, with the real browser module under it:
// node --test backend/scripts/tests/signed-out-bet-resume.test.cjs
const assert = require('node:assert/strict')
const { test, afterEach } = require('node:test')
const { JSDOM } = require('./runtime/node_modules/jsdom')
const React = require('react')
const { createRoot } = require('react-dom/client')
const { load } = require('./load-ts.cjs')
const { act } = React
const dom = new JSDOM('<body></body>', { url: 'https://manifold.markets/' })
global.window = dom.window
global.document = dom.window.document
global.IS_REACT_ACT_ENVIRONMENT = true

const random = load('common/src/util/random.ts', {})
const abTest = load('common/src/ab-test.ts', { './util/random': random })
const rules = load('common/src/signed-out-bet.ts', { './ab-test': abTest })
const json = load('common/src/util/json.ts', {})

const START = 1_800_000_000_000
const mounted = []
const settle = () => new Promise((resolve) => setImmediate(resolve))
const flush = () => act(async () => settle())

function newStore() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  }
}

// One page load: fresh module state over the given tab and device storage.
function page(options = {}) {
  const { session = newStore(), local = newStore(), mode } = options
  local.setItem(rules.SIGNED_OUT_BET_FORCE_KEY, 'treatment')
  const clock = { now: options.now ?? START }
  const state = {
    user: options.user ?? null,
    dialogFails: false,
    done: null,
    // Who was signed in each time the ticket rendered.
    shownTo: [],
    // What analytics was asked to store, and whether it manages to.
    events: [],
    stores: true,
  }
  // Lets a test hold the ticket's dynamic import open. The compiled import is
  // `Promise.resolve().then(() => require(...))`.
  const gate = { hold: false, release: undefined }
  const PromiseShim = {
    resolve: () =>
      gate.hold
        ? new Promise((resolve) => (gate.release = resolve))
        : Promise.resolve(),
  }
  const lib = load(
    'web/lib/util/signed-out-bet.ts',
    {
      'common/signed-out-bet': rules,
      'common/util/json': json,
      'web/lib/firebase/users': { firebaseLogin: () => new Promise(() => {}) },
      'web/lib/native/is-native': { getIsNative: () => false },
      'web/lib/service/analytics': {
        track: async (name, properties) => {
          state.events.push({ name, ...properties })
          return state.stores
        },
      },
      'web/lib/util/device-token': { ensureDeviceToken: () => 'device-1' },
      'web/lib/util/local': {
        safeLocalStorage: local,
        safeSessionStorage: session,
      },
    },
    {
      window: { location: { hostname: 'manifold.markets' } },
      process: { env: { NEXT_PUBLIC_SIGNED_OUT_BET_SIGNIN: mode } },
      Date: { now: () => clock.now },
      // Retry timers are not run here; the host is what sends.
      setTimeout: () => 0,
    }
  )
  // Stands in for the lazily fetched trade ticket.
  const Ticket = (props) => {
    state.done = props.onDone
    state.shownTo.push(state.user?.id)
    return React.createElement('div', {
      'data-ticket': props.bet.contractId,
      'data-outcome': props.bet.outcome ?? '',
    })
  }
  const dependencies = {
    'common/signed-out-bet': rules,
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
    'web/hooks/use-user': { useUser: () => state.user },
    'web/lib/util/signed-out-bet': lib,
  }
  Object.defineProperty(dependencies, './resumed-bet-dialog', {
    enumerable: true,
    get() {
      if (state.dialogFails) throw new Error('chunk failed to load')
      return { ResumedBetDialog: Ticket }
    },
  })
  const { ResumePendingBet } = load(
    'web/components/bet/resume-pending-bet.tsx',
    dependencies,
    { Promise: PromiseShim }
  )
  // Reports in from a mount effect, as the real welcome flow does.
  const Welcome = () => {
    React.useEffect(() => lib.registerWelcome(), [])
    return null
  }
  return { lib, state, gate, session, local, clock, ResumePendingBet, Welcome }
}

// Renders the host first and the page's own content after it, the order
// Page uses.
async function mount(p, { welcome = false, strict = false } = {}) {
  const element = document.createElement('div')
  document.body.appendChild(element)
  const root = createRoot(element)
  mounted.push(root)
  const view = { welcome }
  const tree = () => {
    const content = React.createElement(
      React.Fragment,
      null,
      React.createElement(p.ResumePendingBet),
      view.welcome ? React.createElement(p.Welcome) : null
    )
    return strict
      ? React.createElement(React.StrictMode, null, content)
      : content
  }
  const render = async () => {
    await act(async () => root.render(tree()))
    await flush()
  }
  await render()
  return {
    render,
    view,
    ticket: () => element.querySelector('[data-ticket]'),
    tickets: () => element.querySelectorAll('[data-ticket]').length,
  }
}

// A press notifies the mounted host, so it runs inside act like any update.
const rowPress = (p, contractId = 'c1', outcome = 'NO') =>
  act(async () =>
    p.lib.onSignedOutBetPress({
      contractId,
      location: 'contract table',
      surface: 'button',
      outcome,
    })
  )
const stored = (p) => p.session.getItem(rules.PENDING_BET_KEY)

afterEach(async () => {
  await act(async () => mounted.splice(0).forEach((root) => root.unmount()))
  document.body.innerHTML = ''
})

test('an existing account gets its ticket as soon as it is signed in', async () => {
  const p = page()
  const view = await mount(p)
  assert.equal(view.ticket(), null)
  await rowPress(p)
  await flush()
  // Still signed out: remembered, not shown.
  assert.equal(view.ticket(), null)
  assert.notEqual(stored(p), null)

  p.state.user = { id: 'u1' }
  await view.render()
  assert.equal(view.ticket().dataset.ticket, 'c1')
  assert.equal(view.ticket().dataset.outcome, 'NO')
  assert.equal(stored(p), null)

  // Closing it is final.
  await act(async () => p.state.done())
  assert.equal(view.ticket(), null)
  await view.render()
  assert.equal(view.ticket(), null)
})

test('a new account sees the welcome steps first, then its ticket', async () => {
  const p = page()
  const view = await mount(p, { welcome: true })
  await rowPress(p)
  p.state.user = { id: 'u1', shouldShowWelcome: true }
  await view.render()
  assert.equal(view.ticket(), null)
  // Left in the tab's storage, so a reload mid-welcome does not lose it.
  assert.notEqual(stored(p), null)

  await act(async () => p.lib.markWelcomeFinished('u1'))
  await flush()
  assert.equal(view.ticket().dataset.ticket, 'c1')
  assert.equal(stored(p), null)
})

test('a page that loads already signed in still waits for its welcome steps', async () => {
  // The bet was remembered on the previous page load of this tab.
  const session = newStore()
  await rowPress(page({ session }))
  // This load starts with the account present on the very first render, and
  // the host mounts before the welcome flow has reported in.
  const p = page({ session, user: { id: 'u1', shouldShowWelcome: true } })
  const view = await mount(p, { welcome: true })
  assert.equal(view.ticket(), null)
  assert.notEqual(stored(p), null)

  await act(async () => p.lib.markWelcomeFinished('u1'))
  await flush()
  assert.equal(view.ticket().dataset.ticket, 'c1')
})

test('a welcome flow that appears after the ticket hides it until it is done', async () => {
  const session = newStore()
  await rowPress(page({ session }))
  const p = page({ session, user: { id: 'u1', shouldShowWelcome: true } })
  // No welcome flow on this page, so nothing to wait for.
  const view = await mount(p)
  assert.equal(view.ticket().dataset.ticket, 'c1')

  view.view.welcome = true
  await view.render()
  assert.equal(view.ticket(), null)

  await act(async () => p.lib.markWelcomeFinished('u1'))
  await flush()
  assert.equal(view.ticket().dataset.ticket, 'c1')
})

test('a new account on a page without welcome steps gets its ticket at once', async () => {
  const p = page()
  const view = await mount(p)
  await rowPress(p, 'c7', 'YES')
  p.state.user = { id: 'u1', shouldShowWelcome: true }
  await view.render()
  assert.equal(view.ticket().dataset.ticket, 'c7')
  assert.equal(view.ticket().dataset.outcome, 'YES')
})

test('the ticket does not pass to another account on the same tab', async () => {
  const p = page()
  const view = await mount(p)
  await rowPress(p)
  p.state.user = { id: 'u1' }
  await view.render()
  assert.equal(view.ticket().dataset.ticket, 'c1')

  p.state.user = { id: 'u2' }
  await view.render()
  assert.equal(view.ticket(), null)
  // Not even for the one render before the host clears what it held.
  assert.ok(!p.state.shownTo.includes('u2'))
  // Nor does it come back for the first account.
  p.state.user = { id: 'u1' }
  await view.render()
  assert.equal(view.ticket(), null)
})

test('signing out closes the ticket', async () => {
  const p = page()
  const view = await mount(p)
  await rowPress(p)
  p.state.user = { id: 'u1' }
  await view.render()
  assert.equal(view.ticket().dataset.ticket, 'c1')
  p.state.user = null
  await view.render()
  assert.equal(view.ticket(), null)
})

test('an account change while the ticket is still loading drops it', async () => {
  const p = page()
  const view = await mount(p)
  await rowPress(p)
  p.gate.hold = true
  p.state.user = { id: 'u1' }
  await view.render()
  // Taken for u1, its ticket still on the way.
  assert.equal(view.ticket(), null)
  assert.equal(stored(p), null)

  p.state.user = { id: 'u2' }
  await view.render()
  await act(async () => p.gate.release())
  await flush()
  assert.equal(view.ticket(), null)
  p.state.user = { id: 'u1' }
  await view.render()
  assert.equal(view.ticket(), null)
})

test('the kill switch stops a remembered bet from reopening', async () => {
  const session = newStore()
  await rowPress(page({ session }))
  const p = page({ session, mode: 'off' })
  const view = await mount(p)
  p.state.user = { id: 'u1' }
  await view.render()
  assert.equal(view.ticket(), null)
  assert.equal(stored(p), null)
})

test('an expired bet is dropped at sign-in', async () => {
  const p = page()
  const view = await mount(p)
  await rowPress(p)
  p.clock.now += rules.PENDING_BET_TTL_MS
  p.state.user = { id: 'u1' }
  await view.render()
  assert.equal(view.ticket(), null)
  assert.equal(stored(p), null)
})

test('a ticket that fails to load leaves the page as it was', async () => {
  const p = page()
  p.state.dialogFails = true
  const view = await mount(p)
  await rowPress(p)
  p.state.user = { id: 'u1' }
  await view.render()
  assert.equal(view.ticket(), null)
  assert.equal(stored(p), null)

  // The next press works once the ticket can load again. It needs a
  // signed-out moment first, like any press.
  p.state.dialogFails = false
  p.state.user = null
  await view.render()
  await rowPress(p, 'c2')
  p.state.user = { id: 'u1' }
  await view.render()
  assert.equal(view.ticket().dataset.ticket, 'c2')
})

test('strict mode shows one ticket, once', async () => {
  const p = page()
  const view = await mount(p, { strict: true })
  await rowPress(p)
  p.state.user = { id: 'u1' }
  await view.render()
  assert.equal(view.tickets(), 1)
  assert.equal(view.ticket().dataset.ticket, 'c1')
})

const exposures = (p) =>
  p.state.events.filter((e) => e.name === rules.SIGNED_OUT_BET_TEST)

test('an exposure that could not be stored is sent by the next page, and again at sign-in, with no press', async () => {
  // Pressed on one page load, where nothing could be stored.
  const local = newStore()
  const session = newStore()
  const pressed = page({ local, session })
  pressed.state.stores = false
  await rowPress(pressed)
  await flush()
  assert.equal(exposures(pressed).length, 1)
  assert.notEqual(local.getItem(rules.SIGNED_OUT_BET_UNSENT_KEY), null)

  // The next page tries as it loads, still signed out. It fails again.
  const p = page({ local, session, now: START + 20_000 })
  p.state.stores = false
  const view = await mount(p)
  assert.equal(exposures(p).length, 1)
  assert.notEqual(local.getItem(rules.SIGNED_OUT_BET_UNSENT_KEY), null)

  // The visitor signs up there and never presses signed-out again. Signing
  // in is enough to send it, and it still counts from the press.
  p.state.stores = true
  p.clock.now = START + 45_000
  p.state.user = { id: 'u1' }
  await view.render()
  const sent = exposures(p)
  assert.equal(sent.length, 2)
  assert.equal(sent[1].contractId, 'c1')
  assert.equal(sent[1].surface, 'button')
  assert.equal(sent[1].firstSurface, 'button')
  assert.equal(sent[1].sinceFirstPressMs, 45_000)
  assert.equal(local.getItem(rules.SIGNED_OUT_BET_UNSENT_KEY), null)
  // The ticket still reopens as before.
  assert.equal(view.ticket().dataset.ticket, 'c1')

  // Nothing is sent twice by later renders or account changes.
  await view.render()
  p.state.user = null
  await view.render()
  assert.equal(exposures(p).length, 2)
})

test('a page with nothing waiting sends nothing', async () => {
  const p = page()
  const view = await mount(p, { strict: true })
  p.state.user = { id: 'u1' }
  await view.render()
  assert.deepEqual(p.state.events, [])
})

test('nothing renders without a remembered bet', async () => {
  const p = page()
  const view = await mount(p, { welcome: true })
  assert.equal(view.ticket(), null)
  p.state.user = { id: 'u1', shouldShowWelcome: true }
  await view.render()
  await act(async () => p.lib.markWelcomeFinished('u1'))
  await flush()
  assert.equal(view.ticket(), null)
})
