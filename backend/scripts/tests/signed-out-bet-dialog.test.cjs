// The reopened ticket itself, over the real market rules, with stand-ins for
// the two trade dialogs it opens:
// node --test backend/scripts/tests/signed-out-bet-dialog.test.cjs
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
const rules = load('common/src/signed-out-bet.ts', {
  './ab-test': load('common/src/ab-test.ts', { './util/random': random }),
})

const NOW = 1_800_000_000_000
const DAY = 86_400_000
const clock = { now: NOW }
// The real common/contract. The ticket only calls isMultiCpmm and
// tradingAllowed, which use nothing that file imports.
const contracts = load(
  'common/src/contract.ts',
  {
    'common/calculate': {},
    lodash: {},
    './calculate-cpmm': {},
    './envs/constants': {},
    './util/format': {},
    './util/time': {},
  },
  { Date: { now: () => clock.now } }
)

const market = (fields = {}) => ({
  id: 'c1',
  slug: 'will-it-rain',
  mechanism: 'cpmm-1',
  outcomeType: 'BINARY',
  closeTime: NOW + DAY,
  isResolved: false,
  ...fields,
})
const rowBet = (fields = {}) => ({
  contractId: 'c1',
  location: 'contract table',
  createdTime: NOW - 42_000,
  outcome: 'NO',
  enrolled: true,
  forced: false,
  ...fields,
})
const MARKET_PAGE = '/[username]/[contractSlug]'

const mounted = []

// One reopened ticket. `contract` is what the fetch by id returns: undefined
// while it is loading, null if there is no such market.
function ticket(options = {}) {
  const state = {
    contract: 'contract' in options ? options.contract : market(),
    // What the live subscription has, once it differs from the fetched copy.
    live: undefined,
    router: options.router ?? { pathname: '/browse', query: {} },
    fetched: [],
    done: 0,
    events: [],
    // Props of the trade dialog on screen.
    dialog: undefined,
  }
  const dialog = (kind) => (props) => {
    state.dialog = props
    return React.createElement('div', {
      'data-dialog': kind,
      'data-contract': props.contract.id,
    })
  }
  const { ResumedBetDialog } = load(
    'web/components/bet/resumed-bet-dialog.tsx',
    {
      'common/contract': contracts,
      'common/signed-out-bet': rules,
      'next/router': { useRouter: () => state.router },
      react: React,
      'react/jsx-runtime': require('react/jsx-runtime'),
      'web/hooks/use-contract': {
        useContract: (id) => {
          state.fetched.push(id)
          return state.contract
        },
        useLiveContract: (initial) => state.live ?? initial,
      },
      'web/lib/service/analytics': {
        track: (name, properties) => {
          state.events.push({ name, ...properties })
          return Promise.resolve(true)
        },
      },
      './bet-dialog': {
        BetDialog: dialog('binary'),
        MultiBetDialog: dialog('multi'),
      },
    },
    { Date: { now: () => clock.now } }
  )
  return { state, ResumedBetDialog }
}

async function mount(t, bet = rowBet(), { strict = false } = {}) {
  const element = document.createElement('div')
  document.body.appendChild(element)
  const root = createRoot(element)
  mounted.push(root)
  const tree = () => {
    // A new callback on every render, as the host passes.
    const content = React.createElement(t.ResumedBetDialog, {
      bet,
      onDone: () => t.state.done++,
    })
    return strict
      ? React.createElement(React.StrictMode, null, content)
      : content
  }
  const render = () => act(async () => root.render(tree()))
  await render()
  return {
    render,
    shown: () => element.querySelector('[data-dialog]')?.dataset.dialog,
    count: () => element.querySelectorAll('[data-dialog]').length,
  }
}

afterEach(async () => {
  clock.now = NOW
  await act(async () => mounted.splice(0).forEach((root) => root.unmount()))
  document.body.innerHTML = ''
})

test('a binary market reopens the ticket its row button opens, on the side that was pressed', async () => {
  const t = ticket()
  const view = await mount(t, rowBet({ location: 'browse card' }))
  assert.equal(view.shown(), 'binary')
  assert.deepEqual(t.state.fetched.slice(0, 1), ['c1'])
  assert.equal(t.state.dialog.contract, t.state.contract)
  assert.equal(t.state.dialog.open, true)
  // The bet placed from it reports the button that was pressed.
  assert.equal(t.state.dialog.trackingLocation, 'browse card')
  assert.equal(t.state.dialog.initialOutcome, 'NO')
  assert.deepEqual(t.state.events, [
    {
      name: rules.SIGNED_OUT_BET_RESUME_EVENT,
      contractId: 'c1',
      location: 'browse card',
      outcome: 'NO',
      forced: false,
      ms: 42_000,
    },
  ])

  // Closing the ticket is what ends it.
  assert.equal(t.state.done, 0)
  await act(async () => t.state.dialog.setOpen(true))
  assert.equal(t.state.done, 0)
  await act(async () => t.state.dialog.setOpen(false))
  assert.equal(t.state.done, 1)
})

test('a multiple choice market reopens its own ticket, on either mechanism', async () => {
  for (const mechanism of ['cpmm-multi-1', 'cpmm-multi-2']) {
    const contract = market({ mechanism, outcomeType: 'MULTIPLE_CHOICE' })
    const t = ticket({ contract })
    const view = await mount(t, rowBet({ outcome: undefined }))
    assert.equal(view.shown(), 'multi', mechanism)
    assert.equal(t.state.dialog.contract, contract)
    assert.equal(t.state.dialog.open, true)
    assert.equal(t.state.events.length, 1, mechanism)
    assert.equal(t.state.events[0].outcome, undefined)
    await act(async () => t.state.dialog.setOpen(false))
    assert.equal(t.state.done, 1)
  }
})

test('only a press that was part of the test is reported', async () => {
  // Rolled out to everyone: the remembered bet carries no test flags.
  const rolledOut = ticket()
  const view = await mount(
    rolledOut,
    rowBet({ enrolled: undefined, forced: undefined })
  )
  assert.equal(view.shown(), 'binary')
  assert.deepEqual(rolledOut.state.events, [])

  // A QA press says so.
  const forced = ticket()
  await mount(forced, rowBet({ forced: true }))
  assert.equal(forced.state.events.length, 1)
  assert.equal(forced.state.events[0].forced, true)
})

test('the ticket is reported once, however often it renders', async () => {
  const t = ticket()
  const view = await mount(t, rowBet(), { strict: true })
  await view.render()
  await view.render()
  assert.equal(view.count(), 1)
  assert.equal(t.state.events.length, 1)
  assert.equal(t.state.done, 0)
})

test('nothing shows while the market is loading', async () => {
  const t = ticket({ contract: undefined })
  const view = await mount(t)
  assert.equal(view.shown(), undefined)
  assert.equal(t.state.done, 0)
  assert.deepEqual(t.state.events, [])

  t.state.contract = market()
  await view.render()
  assert.equal(view.shown(), 'binary')
  assert.equal(t.state.events.length, 1)
})

test('a market that no longer exists is dropped', async () => {
  const t = ticket({ contract: null })
  const view = await mount(t)
  assert.equal(view.shown(), undefined)
  assert.ok(t.state.done > 0)
  assert.deepEqual(t.state.events, [])
})

test('a market that cannot be traded is dropped, unreported', async () => {
  for (const [why, contract] of [
    ['closed', market({ closeTime: NOW - 1 })],
    ['resolved', market({ isResolved: true, closeTime: NOW - DAY })],
    ['resolved early', market({ isResolved: true })],
    ['a poll', market({ mechanism: 'none', outcomeType: 'POLL' })],
    [
      'closed multiple choice',
      market({ mechanism: 'cpmm-multi-2', closeTime: NOW - 1 }),
    ],
    ['a mechanism with no ticket', market({ mechanism: 'something-else' })],
  ]) {
    const t = ticket({ contract })
    const view = await mount(t)
    assert.equal(view.shown(), undefined, why)
    assert.ok(t.state.done > 0, why)
    assert.deepEqual(t.state.events, [], why)
  }
  // No close time at all is open.
  const open = ticket({ contract: market({ closeTime: undefined }) })
  assert.equal((await mount(open)).shown(), 'binary')
})

test('the live market decides, not the copy that was fetched', async () => {
  // Fetched open, but it has closed since.
  const stale = ticket()
  stale.state.live = market({ closeTime: NOW - 1 })
  const staleView = await mount(stale)
  assert.equal(staleView.shown(), undefined)
  assert.ok(stale.state.done > 0)
  assert.deepEqual(stale.state.events, [])

  // It closes while the ticket is open: the ticket goes, reported once.
  const t = ticket()
  const view = await mount(t)
  assert.equal(view.shown(), 'binary')
  t.state.live = market({ isResolved: true })
  await view.render()
  assert.equal(view.shown(), undefined)
  assert.ok(t.state.done > 0)
  assert.equal(t.state.events.length, 1)
})

test('the market page already has a ticket for its own market', async () => {
  // Found by slug alone: a link with an old username still counts.
  for (const username of ['its-creator', 'an-old-username']) {
    const t = ticket({
      router: {
        pathname: MARKET_PAGE,
        query: { username, contractSlug: 'will-it-rain' },
      },
    })
    const view = await mount(t)
    assert.equal(view.shown(), undefined, username)
    assert.ok(t.state.done > 0, username)
    assert.deepEqual(t.state.events, [], username)
  }

  // Another market's page, and another kind of page with the same slug in
  // its address, have no ticket for this market.
  for (const router of [
    {
      pathname: MARKET_PAGE,
      query: { username: 'its-creator', contractSlug: 'another-market' },
    },
    {
      pathname: '/embed/[username]/[contractSlug]',
      query: { username: 'its-creator', contractSlug: 'will-it-rain' },
    },
    { pathname: '/browse', query: { contractSlug: 'will-it-rain' } },
  ]) {
    const t = ticket({ router })
    const view = await mount(t)
    assert.equal(view.shown(), 'binary', router.pathname)
    assert.equal(t.state.done, 0)
    assert.equal(t.state.events.length, 1)
  }
})
