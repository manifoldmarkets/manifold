const assert = require('node:assert/strict')
const { test, afterEach } = require('node:test')
const { JSDOM } = require('./runtime/node_modules/jsdom')
const React = require('react')
const { createRoot } = require('react-dom/client')
const { load } = require('./load-ts.cjs')
const { act } = React
const dom = new JSDOM('<body></body>', {
  url: 'https://preview.vercel.app/browse',
})
global.window = dom.window
global.document = dom.window.document
global.IS_REACT_ACT_ENVIRONMENT = true
window.scrollTo = () => {}
const globals = { window, document, process, AbortController }
const useEvent = load('client-common/src/hooks/use-event.ts', {
  react: React,
  'client-common/hooks/use-safe-layout-effect': {
    useSafeLayoutEffect: React.useLayoutEffect,
  },
})
const json = load('common/src/util/json.ts', {})
const persistent = load('web/hooks/use-persistent-local-state.ts', {
  react: React,
  'common/util/json': json,
  'web/lib/util/local': { safeLocalStorage: undefined },
  'client-common/hooks/use-persistent-in-memory-state': {
    isFunction: (v) => typeof v === 'function',
  },
  'client-common/hooks/use-event': useEvent,
  'web/hooks/use-is-client': { useIsClient: () => true },
})
const random = load('common/src/util/random.ts', {})
const ab = load('common/src/ab-test.ts', { './util/random': random })
const rules = load('common/src/browse-rollout.ts', { './ab-test': ab })
const mounted = []
async function mount(render) {
  const element = document.createElement('div')
  document.body.appendChild(element)
  const root = createRoot(element)
  mounted.push(root)
  let value
  function Probe() {
    value = render()
    return null
  }
  await act(async () => root.render(React.createElement(Probe)))
  return {
    get value() {
      return value
    },
    rerender: () => act(async () => root.render(React.createElement(Probe))),
  }
}
afterEach(async () => {
  await act(async () => mounted.splice(0).forEach((root) => root.unmount()))
  document.body.innerHTML = ''
})
function markets(api) {
  return load('web/components/browse-v2/use-browse-markets.ts', {
    react: React,
    lodash: require('lodash'),
    'client-common/hooks/use-event': useEvent,
    'web/lib/api/api': { api },
  }).useBrowseMarkets
}
function browseFixture() {
  const AuthContext = React.createContext(null)
  const events = []
  const auth = { currentUser: null }
  const { useBrowseView } = load(
    'web/components/browse-v2/use-browse-view.ts',
    {
      react: React,
      'common/browse-rollout': rules,
      'next/router': { useRouter: () => ({ pathname: '/home' }) },
      'web/components/auth-context': { AuthContext },
      'web/hooks/use-persistent-local-state': persistent,
      'web/lib/firebase/users': { auth },
      'web/lib/service/analytics': {
        track: (name, data) => events.push({ name, data }),
      },
      'web/lib/util/device-token': {
        getDeviceHistory: () => undefined,
        ensureDeviceToken: () => 'ephemeral',
      },
    },
    globals
  )
  return { useBrowseView, events, auth, AuthContext }
}

test('blocked storage: opt in to new Browse, settle the lens and fetch markets', async () => {
  const { useBrowseView, events } = browseFixture()
  const calls = []
  const useMarkets = markets(async (...args) => {
    calls.push(args)
    return [{ id: 'first' }]
  })
  const probe = await mount(() => {
    const view = useBrowseView()
    const [lens, , ready] = persistent.usePersistentLocalState(
      'best',
      'browse-v2-lens'
    )
    const feed = useMarkets(
      view.ready && view.view === 'new' && ready
        ? { sort: 'score' }
        : undefined,
      40
    )
    return { view, ready, lens, feed }
  })
  assert.equal(probe.value.view.view, 'legacy')
  assert.equal(calls.length, 0)
  await act(async () => probe.value.view.setView('new'))
  assert.equal(probe.value.ready, true)
  assert.equal(probe.value.lens, 'best')
  assert.equal(probe.value.feed.contracts[0].id, 'first')
  assert.equal(calls.length, 1)
  assert.equal(
    events.filter((e) => e.name === rules.BROWSE_TOGGLE_EVENT).length,
    1
  )
})

test('signed-out /home does not enroll or expose a layout before redirect', async () => {
  const { useBrowseView, events } = browseFixture()
  let enabled = false
  const probe = await mount(() => useBrowseView({ enabled }))
  assert.equal(probe.value.ready, false)
  assert.equal(events.length, 0)
  // An actual public browse route can then enable the same hook.
  enabled = true
  await probe.rerender()
  assert.equal(probe.value.ready, true)
  assert.equal(events.length, 1)
  enabled = false
  await probe.rerender()
  assert.equal(probe.value.ready, false)
  assert.equal(events.length, 1)
})

test('the real Home page disables enrollment for loading and signed-out users', async () => {
  const { useBrowseView, events } = browseFixture()
  let user
  const empty = () => null
  const { default: Home } = load(
    'web/pages/home/index.tsx',
    {
      'react/jsx-runtime': require('react/jsx-runtime'),
      'next/router': {},
      'web/components/SEO': { SEO: empty },
      'web/components/home/daily-stats': { DailyStats: empty },
      'web/components/layout/page': { Page: empty },
      'web/components/nav/banner': { DowntimeBanner: empty },
      'web/components/onboarding/welcome': { Welcome: empty },
      'web/components/onboarding/verification-result-modal': {
        VerificationResultModal: empty,
      },
      'web/components/user/flagged-account-banner': {
        FlaggedAccountBanner: empty,
      },
      'web/hooks/use-redirect-if-signed-out': { useRedirectIfSignedOut: empty },
      'web/hooks/use-save-referral': { useSaveReferral: empty },
      'web/hooks/use-user': { useUser: () => user },
      'web/lib/service/analytics': { track: empty },
      '../browse': { BrowsePageContent: empty, BrowseViewToggle: empty },
      'web/components/browse-v2/use-browse-view': { useBrowseView },
      'web/public/custom-components/manaCoin': { ManaCoin: empty },
    },
    globals
  )
  const probe = await mount(() => Home())
  assert.equal(events.length, 0)
  user = null
  await probe.rerender()
  assert.equal(events.length, 0)
})

for (const sort of ['score', 'newest']) {
  test(`failed ${sort} page retries the same cursor and preserves existing results`, async () => {
    const calls = []
    const first = [
      { id: 'a', createdTime: 20 },
      { id: 'b', createdTime: 10 },
    ]
    const useMarkets = markets(async (_, args) => {
      calls.push(args)
      if (calls.length === 1) return first
      if (calls.length === 2) throw new Error('offline')
      return [{ id: 'c', createdTime: 5 }]
    })
    const probe = await mount(() => useMarkets({ sort }, 2))
    await act(async () => probe.value.loadMore())
    assert.match(probe.value.error, /offline/)
    assert.equal(probe.value.hasMore, false)
    assert.deepEqual(
      probe.value.contracts.map((c) => c.id),
      ['a', 'b']
    )
    await act(async () => probe.value.retry())
    assert.deepEqual(calls[2], calls[1])
    assert.equal(calls[2].offset, sort === 'newest' ? 0 : 2)
    assert.equal(calls[2].beforeTime, sort === 'newest' ? 10 : undefined)
    assert.deepEqual(
      probe.value.contracts.map((c) => c.id),
      ['a', 'b', 'c']
    )
    assert.equal(probe.value.error, undefined)
  })
}

test('failed first page can retry, and stale query responses cannot replace it', async () => {
  let resolveOld
  let calls = 0
  const useMarkets = markets(async (_, args) => {
    calls++
    if (args.term === 'old')
      return new Promise((resolve) => {
        resolveOld = resolve
      })
    if (calls === 2) throw new Error('offline')
    return [{ id: 'new' }]
  })
  let term = 'old'
  const probe = await mount(() => useMarkets({ term }, 2))
  term = 'new'
  await probe.rerender()
  await act(async () => resolveOld([{ id: 'old' }]))
  assert.match(probe.value.error, /offline/)
  await act(async () => probe.value.retry())
  assert.equal(probe.value.contracts[0].id, 'new')
})

test('inactive search categories do not request data', async () => {
  const { useSearchResults } = load(
    'web/components/browse-v2/use-search-results.ts',
    {
      react: React,
      lodash: require('lodash'),
      'client-common/hooks/use-event': useEvent,
    },
    globals
  )
  let enabled = false
  let calls = 0
  const probe = await mount(() =>
    useSearchResults(
      'mnx',
      20,
      async () => {
        calls++
        return []
      },
      enabled
    )
  )
  assert.equal(calls, 0)
  enabled = true
  await probe.rerender()
  assert.equal(calls, 1)
})

test('Supabase auth can reset REST and realtime credentials after logout', () => {
  const realtime = []
  const db = {
    rest: { headers: {} },
    realtime: { setAuth: (token) => realtime.push(token) },
  }
  const { updateSupabaseAuth } = load(
    'web/lib/supabase/db.ts',
    {
      'common/supabase/utils': { createClient: () => db },
      'common/envs/constants': { ENV_CONFIG: {} },
    },
    { process: { env: {} } }
  )
  updateSupabaseAuth('old-account')
  assert.equal(db.rest.headers.Authorization, 'Bearer old-account')
  updateSupabaseAuth(undefined)
  assert.equal(db.rest.headers.Authorization, undefined)
  assert.deepEqual(realtime, ['old-account', null])
})
