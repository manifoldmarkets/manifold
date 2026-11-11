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
const persistentWith = (safeLocalStorage) =>
  load('web/hooks/use-persistent-local-state.ts', {
    react: React,
    'common/util/json': json,
    'web/lib/util/local': { safeLocalStorage },
    'client-common/hooks/use-persistent-in-memory-state': {
      isFunction: (v) => typeof v === 'function',
    },
    'client-common/hooks/use-event': useEvent,
    'web/hooks/use-is-client': { useIsClient: () => true },
  })
// Storage blocked, unless a test brings a device's own.
const persistent = persistentWith(undefined)
const hubFold = load('web/components/browse-v2/hub-fold.ts', {})
const random = load('common/src/util/random.ts', {})
const ab = load('common/src/ab-test.ts', { './util/random': random })
const rules = load('common/src/browse-rollout.ts', { './ab-test': ab })
const mounted = []
async function mount(render, renderValue = false) {
  const element = document.createElement('div')
  document.body.appendChild(element)
  const root = createRoot(element)
  mounted.push(root)
  let value
  function Probe() {
    value = render()
    return renderValue ? value : null
  }
  await act(async () => root.render(React.createElement(Probe)))
  return {
    get value() {
      return value
    },
    rerender: () => act(async () => root.render(React.createElement(Probe))),
  }
}

function visibilityFixture() {
  const observers = []
  const timers = new Map()
  let nextTimer = 0
  class IntersectionObserver {
    constructor(callback) {
      this.callback = callback
      this.active = false
      observers.push(this)
    }
    observe() {
      this.active = true
    }
    unobserve() {
      this.active = false
    }
    disconnect() {
      this.active = false
    }
    emit(visible) {
      this.callback([{ isIntersecting: visible }])
    }
  }
  const { LoadMoreUntilNotVisible } = load(
    'web/components/widgets/visibility-observer.tsx',
    {
      react: React,
      'react/jsx-runtime': require('react/jsx-runtime'),
      'client-common/hooks/use-event': useEvent,
    },
    {
      ...globals,
      IntersectionObserver,
      setTimeout: (callback) => {
        const id = ++nextTimer
        timers.set(id, callback)
        return id
      },
      clearTimeout: (id) => timers.delete(id),
    }
  )
  return {
    Loader: LoadMoreUntilNotVisible,
    observers,
    timers,
    tick: () => {
      const pending = [...timers.values()]
      timers.clear()
      pending.forEach((callback) => callback())
    },
  }
}

test('load-more cancels a scheduled repeat when its sentinel unmounts', async () => {
  const f = visibilityFixture()
  let calls = 0
  let show = true
  const probe = await mount(
    () =>
      show
        ? React.createElement(f.Loader, {
            loadMore: async () => {
              calls++
              return true
            },
          })
        : null,
    true
  )
  await act(async () => f.observers.at(-1).emit(true))
  assert.equal(calls, 1)
  assert.equal(f.timers.size, 1)
  show = false
  await probe.rerender()
  await act(async () => f.tick())
  assert.equal(calls, 1, 'an unmounted sentinel must not load again')
  assert.equal(f.timers.size, 0)
})

test('load-more cannot restart when an in-flight request resolves after unmount', async () => {
  const f = visibilityFixture()
  const page = deferred()
  let calls = 0
  let show = true
  const probe = await mount(
    () =>
      show
        ? React.createElement(f.Loader, {
            loadMore: () => {
              calls++
              return page.promise
            },
          })
        : null,
    true
  )
  const observer = f.observers.at(-1)
  await act(async () => observer.emit(true))
  show = false
  await probe.rerender()
  // An observer notification already queued before disconnect is stale too.
  await act(async () => observer.emit(true))
  await act(async () => page.resolve(true))
  await act(async () => f.tick())
  assert.equal(calls, 1)
  assert.equal(f.timers.size, 0)
})

test('load-more stays serial and resumes on visibility in StrictMode', async () => {
  const f = visibilityFixture()
  const page = deferred()
  let calls = 0
  await mount(
    () =>
      React.createElement(
        React.StrictMode,
        null,
        React.createElement(f.Loader, {
          loadMore: async () => {
            calls++
            return calls === 1 ? page.promise : false
          },
        })
      ),
    true
  )
  const observer = f.observers.at(-1)
  await act(async () => {
    observer.emit(true)
    observer.emit(true)
  })
  assert.equal(
    calls,
    1,
    'visibility callbacks must not start overlapping loops'
  )
  await act(async () => page.resolve(true))
  assert.equal(f.timers.size, 1)
  await act(async () => observer.emit(false))
  await act(async () => f.tick())
  assert.equal(calls, 1)
  await act(async () => observer.emit(true))
  assert.equal(calls, 2)
  assert.equal(f.timers.size, 0, 'exhausted results must stop pagination')
})

async function settleUntil(check) {
  const deadline = Date.now() + 3000
  while (!check()) {
    assert.ok(Date.now() < deadline, 'React did not reach the expected state')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

test('a lens switch cannot let an orphaned sentinel paginate the new feed', async () => {
  // Use normal React scheduling: act() can batch away the intermediate loading
  // render that unmounts the old sentinel during a real query change.
  global.IS_REACT_ACT_ENVIRONMENT = false
  const f = visibilityFixture()
  const calls = []
  const useMarkets = markets(async (_, args) => {
    calls.push(args)
    return [0, 1].map((i) => ({ id: `${args.sort}-${args.offset + i}` }))
  })
  let feed
  function Feed({ sort }) {
    feed = useMarkets({ sort }, 2)
    return feed.contracts && feed.hasMore
      ? React.createElement(f.Loader, { loadMore: feed.loadMore })
      : null
  }
  const element = document.createElement('div')
  document.body.appendChild(element)
  const root = createRoot(element)
  try {
    root.render(React.createElement(Feed, { sort: 'score' }))
    await settleUntil(() => f.observers.some((o) => o.active))
    f.observers.at(-1).emit(true)
    await settleUntil(() => feed.contracts?.length === 4 && f.timers.size > 0)
    root.render(React.createElement(Feed, { sort: 'most-popular' }))
    await settleUntil(
      () =>
        feed.contracts?.[0]?.id === 'most-popular-0' && f.observers.length > 1
    )
    assert.equal(f.observers[0].active, false)
    const before = calls.length
    // Neither a new observation nor user scrolling has made the new sentinel visible.
    f.tick()
    await new Promise((resolve) => setTimeout(resolve, 30))
    f.tick()
    await new Promise((resolve) => setTimeout(resolve, 30))
    assert.equal(calls.length, before, 'old loop must not page the new lens')
    assert.equal(feed.contracts.length, 2)
    assert.equal(f.timers.size, 0)
    // Normal pagination still works once the replacement sentinel is visible.
    f.observers.at(-1).emit(true)
    await settleUntil(() => feed.contracts.length === 4)
    root.unmount()
    const afterUnmount = calls.length
    f.tick()
    await new Promise((resolve) => setTimeout(resolve, 30))
    assert.equal(
      calls.length,
      afterUnmount,
      'navigation away must stop requests'
    )
    assert.equal(f.timers.size, 0)
  } finally {
    root.unmount()
    global.IS_REACT_ACT_ENVIRONMENT = true
  }
})
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

// Exercise the actual Browse caller and pagination hook, replacing only the
// surrounding widgets and network boundary. `local` is the device's
// localStorage; without it storage is blocked. `memory` is the in-memory
// state that outlives a remount within one visit; without it every mount
// starts fresh, as a page load does.
function browsePageFixture(query = {}, results = [], local, memory) {
  const empty = () => null
  const shared = {
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
    clsx: { default: require('clsx') },
    '@heroicons/react/outline': {
      SearchIcon: empty,
      ViewGridIcon: empty,
      ViewListIcon: empty,
      XIcon: empty,
    },
  }
  const lenses = load('web/components/browse-v2/lens-bar.tsx', {
    ...shared,
    '@headlessui/react': {},
    '@heroicons/react/solid': {},
    'common/topics': { SEARCH_TOPICS_TO_SUBTOPICS: {} },
    'common/util/string': { removeEmojis: (value) => value },
  })
  const calls = []
  let controls
  window.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })
  const Market = ({ contract }) =>
    React.createElement('div', { 'data-market-id': contract.id })
  const { BrowseV2 } = load(
    'web/components/browse-v2/browse-v2.tsx',
    {
      ...shared,
      'client-common/hooks/use-persistent-in-memory-state': memory ?? {
        usePersistentInMemoryState: React.useState,
      },
      'next/router': { useRouter: () => ({ isReady: true, query }) },
      'web/components/widgets/visibility-observer': {
        LoadMoreUntilNotVisible: empty,
      },
      'web/hooks/use-persistent-local-state': local
        ? persistentWith(local)
        : persistent,
      'web/hooks/use-is-mobile': { useIsMobile: () => false },
      'web/hooks/use-user': { useUser: () => null },
      'web/lib/firebase/users': { firebaseLogin: empty },
      'web/lib/service/analytics': { track: empty },
      'web/lib/supabase/groups': { listGroupsBySlug: async () => [] },
      'web/lib/util/local': { safeLocalStorage: local },
      './browse-topics': {
        BrowseTopicsProvider: ({ children }) => children,
        useBrowseTopics: () => ({
          version: 0,
          followed: [],
          isExcluded: () => false,
        }),
      },
      './hub-cards': { HubCards: empty },
      './hub-fold': hubFold,
      './lens-bar': {
        ...lenses,
        LensBar: (props) => {
          controls = props
          return null
        },
      },
      './market-card': {
        MarketCard: Market,
        MarketListRow: Market,
        MarketCardSkeleton: empty,
        MarketRowSkeleton: empty,
      },
      './market-shelves': {
        ClosingSoonList: empty,
        MoversStrip: empty,
        NewMarketsList: empty,
      },
      './use-browse-markets': {
        useBrowseMarkets: markets(async (endpoint, params) => {
          assert.equal(endpoint, 'search-markets-full')
          calls.push(params)
          return results
        }),
      },
      './your-topics-modal': { YourTopicsModal: empty },
      './use-scroll-reveal': { useScrollReveal: empty },
      './search-results': { SearchResults: empty, SearchTabs: empty },
    },
    { ...globals, setTimeout, clearTimeout }
  )
  return {
    calls,
    defaults: lenses.DEFAULT_FILTERS,
    get controls() {
      return controls
    },
    mount: () => mount(() => React.createElement(BrowseV2), true),
  }
}

function deviceStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  }
}
// One small house market that belongs in a hub, and one that does not.
const hubMarket = {
  id: 'hub',
  outcomeType: 'BINARY',
  creatorUsername: 'ManifoldSports',
  uniqueBettorCount: 3,
}
const plainMarket = {
  id: 'plain',
  outcomeType: 'BINARY',
  creatorUsername: 'someone',
  uniqueBettorCount: 3,
}
const marketsShown = () =>
  [...document.querySelectorAll('[data-market-id]')].map((element) =>
    element.getAttribute('data-market-id')
  )
const press = (label) =>
  act(async () =>
    [...document.querySelectorAll('button')]
      .find((button) => button.textContent.trim() === label)
      .click()
  )
// A page load ends: what was in memory is gone, what is on the device stays.
const leavePage = async () => {
  await act(async () => mounted.splice(0).forEach((root) => root.unmount()))
  document.body.innerHTML = ''
}

test('the hub-markets choice is remembered on the device, and nothing else is', async () => {
  const local = deviceStorage()
  const first = browsePageFixture({}, [hubMarket, plainMarket], local)
  await first.mount()
  assert.deepEqual(marketsShown(), ['plain'])
  assert.equal(first.controls.filters.showHubMarkets, false)

  await press('Show them here')
  assert.deepEqual(marketsShown(), ['hub', 'plain'])
  assert.equal(first.controls.filters.showHubMarkets, true)
  assert.equal(local.getItem(hubFold.SHOW_HUB_MARKETS_KEY), 'true')
  // A filter for this visit only.
  await act(async () =>
    first.controls.onFilters({ ...first.controls.filters, status: 'closed' })
  )
  assert.equal(first.calls.at(-1).filter, 'closed')
  assert.equal(first.controls.filters.showHubMarkets, true)
  await leavePage()

  const second = browsePageFixture({}, [hubMarket, plainMarket], local)
  await second.mount()
  assert.deepEqual(marketsShown(), ['hub', 'plain'])
  assert.equal(second.controls.filters.showHubMarkets, true)
  assert.equal(second.controls.filters.status, 'open')
  assert.equal(second.calls.at(-1).filter, 'open')

  // Turning it off is remembered too.
  await act(async () =>
    second.controls.onFilters({
      ...second.controls.filters,
      showHubMarkets: false,
    })
  )
  assert.deepEqual(marketsShown(), ['plain'])
  await leavePage()
  const third = browsePageFixture({}, [hubMarket, plainMarket], local)
  await third.mount()
  assert.deepEqual(marketsShown(), ['plain'])
})

test('every reset of the filters also forgets the hub-markets choice', async () => {
  const local = deviceStorage()
  const remember = () => local.setItem(hubFold.SHOW_HUB_MARKETS_KEY, 'true')
  const remembered = () => local.getItem(hubFold.SHOW_HUB_MARKETS_KEY)

  // "Reset filters" in the filter panel hands back the defaults.
  remember()
  let page = browsePageFixture({}, [hubMarket, plainMarket], local)
  await page.mount()
  assert.deepEqual(marketsShown(), ['hub', 'plain'])
  await act(async () => page.controls.onFilters(page.defaults))
  assert.deepEqual(marketsShown(), ['plain'])
  assert.equal(remembered(), 'false')
  await leavePage()

  // "Clear search and filters" on an empty result.
  remember()
  page = browsePageFixture({ f: 'closed' }, [], local)
  await page.mount()
  assert.equal(page.controls.filters.status, 'closed')
  assert.equal(page.controls.filters.showHubMarkets, true)
  await press('Clear search and filters')
  assert.equal(page.controls.filters.status, 'open')
  assert.equal(page.controls.filters.showHubMarkets, false)
  assert.equal(remembered(), 'false')
  await leavePage()
  page = browsePageFixture({}, [hubMarket, plainMarket], local)
  await page.mount()
  assert.deepEqual(marketsShown(), ['plain'])
})

test('filters set by a link or by widening a search leave the hub-markets choice alone', async () => {
  const local = deviceStorage()
  local.setItem(hubFold.SHOW_HUB_MARKETS_KEY, 'true')

  // A link that sets a filter.
  let page = browsePageFixture(
    { ct: 'BINARY' },
    [hubMarket, plainMarket],
    local
  )
  await page.mount()
  assert.equal(page.controls.filters.contractType, 'BINARY')
  assert.equal(page.controls.filters.showHubMarkets, true)
  assert.equal(local.getItem(hubFold.SHOW_HUB_MARKETS_KEY), 'true')
  await leavePage()

  // "Search all markets" on a search with no results.
  page = browsePageFixture({ q: 'nothing like this', f: 'closed' }, [], local)
  await page.mount()
  assert.equal(page.calls.at(-1).filter, 'closed')
  await press('Search all markets')
  assert.equal(page.calls.at(-1).filter, 'all')
  assert.equal(local.getItem(hubFold.SHOW_HUB_MARKETS_KEY), 'true')
  await leavePage()
  page = browsePageFixture({}, [hubMarket, plainMarket], local)
  await page.mount()
  assert.deepEqual(marketsShown(), ['hub', 'plain'])
})

test('a tab that never touched the hub-markets choice cannot undo another tab', async () => {
  const local = deviceStorage()
  // Two tabs open on the same device, both folded.
  const tabA = browsePageFixture({}, [hubMarket, plainMarket], local)
  await tabA.mount()
  const tabB = browsePageFixture({}, [hubMarket, plainMarket], local)
  await tabB.mount()
  await act(async () =>
    tabB.controls.onFilters({ ...tabB.controls.filters, showHubMarkets: true })
  )
  assert.equal(local.getItem(hubFold.SHOW_HUB_MARKETS_KEY), 'true')

  // The first tab changes another filter. It still thinks the choice is
  // off, and must not write that over the second tab's choice.
  await act(async () =>
    tabA.controls.onFilters({ ...tabA.controls.filters, status: 'closed' })
  )
  assert.equal(tabA.calls.at(-1).filter, 'closed')
  assert.equal(local.getItem(hubFold.SHOW_HUB_MARKETS_KEY), 'true')

  // Choosing it in the first tab does write.
  await act(async () =>
    tabA.controls.onFilters({ ...tabA.controls.filters, showHubMarkets: true })
  )
  await act(async () =>
    tabA.controls.onFilters({
      ...tabA.controls.filters,
      showHubMarkets: false,
    })
  )
  assert.equal(local.getItem(hubFold.SHOW_HUB_MARKETS_KEY), 'false')
})

test('with storage blocked the hub-markets choice lasts for the visit, like the other filters', async () => {
  // The real in-memory state, which outlives leaving Browse and coming back.
  const memory = load(
    'client-common/src/hooks/use-persistent-in-memory-state.ts',
    {
      react: React,
      'common/util/json': json,
      'client-common/hooks/use-event': useEvent,
    }
  )
  const page = browsePageFixture(
    {},
    [hubMarket, plainMarket],
    undefined,
    memory
  )
  await page.mount()
  assert.deepEqual(marketsShown(), ['plain'])
  await press('Show them here')
  assert.deepEqual(marketsShown(), ['hub', 'plain'])
  await leavePage()

  // Back on Browse in the same visit: still shown.
  const again = browsePageFixture(
    {},
    [hubMarket, plainMarket],
    undefined,
    memory
  )
  await again.mount()
  assert.deepEqual(marketsShown(), ['hub', 'plain'])
  assert.equal(again.controls.filters.showHubMarkets, true)
  await act(async () => again.controls.onFilters(again.defaults))
  assert.deepEqual(marketsShown(), ['plain'])
  await leavePage()

  // A new page load has nothing to remember it by.
  const reloaded = browsePageFixture({}, [hubMarket, plainMarket])
  await reloaded.mount()
  assert.deepEqual(marketsShown(), ['plain'])
  await press('Show them here')
  assert.deepEqual(marketsShown(), ['hub', 'plain'])
})

test('Closing soonest preserves closing-week and substitutes open for all', async () => {
  const f = browsePageFixture({ s: 'close-date', f: 'closing-week' })
  await f.mount()
  assert.equal(f.calls.at(-1).sort, 'close-date')
  assert.equal(f.calls.at(-1).filter, 'closing-week')
  await act(async () =>
    f.controls.onFilters({ ...f.controls.filters, status: 'all' })
  )
  assert.equal(f.calls.at(-1).sort, 'close-date')
  assert.equal(f.calls.at(-1).filter, 'open')
})

test('Browse enables semantic text search, omits it for browsing and keeps server order', async () => {
  const f = browsePageFixture({ q: '  climate  ' }, [
    { id: 'z-lexical', searchMatchType: 'lexical' },
    { id: 'a-semantic', searchMatchType: 'semantic' },
  ])
  await f.mount()
  assert.equal(f.calls.at(-1).term, 'climate')
  assert.equal(f.calls.at(-1).enableSemanticSearch, true)
  assert.deepEqual(
    [...document.querySelectorAll('[data-market-id]')].map((element) =>
      element.getAttribute('data-market-id')
    ),
    ['z-lexical', 'a-semantic']
  )
  for (const query of [{}, { q: '   ' }]) {
    const browsing = browsePageFixture(query)
    await browsing.mount()
    assert.equal(browsing.calls.at(-1).enableSemanticSearch, undefined)
  }
})

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

async function authFixture() {
  const noop = () => {}
  const auth = { currentUser: null }
  const realtime = []
  const db = {
    rest: { headers: {} },
    realtime: { setAuth: (token) => realtime.push(token) },
  }
  const supabase = load(
    'web/lib/supabase/db.ts',
    {
      'common/supabase/utils': { createClient: () => db },
      'common/envs/constants': { ENV_CONFIG: {} },
    },
    { process: { env: {} } }
  )
  let listener
  let tokenRequest = async () => ({ jwt: `jwt-${auth.currentUser.uid}` })
  const { AuthProvider } = load(
    'web/components/auth-context.tsx',
    {
      react: React,
      'react/jsx-runtime': require('react/jsx-runtime'),
      lodash: require('lodash'),
      'firebase/auth': {
        onIdTokenChanged: (_, callback) => {
          listener = callback
          return noop
        },
      },
      'web/lib/firebase/users': { auth, firebaseLogout: async () => {} },
      'web/lib/api/api': {
        getSupabaseToken: () => tokenRequest(),
        createUser: () => {
          throw new Error('Unexpected signup')
        },
      },
      'web/hooks/use-state-check-equality': {
        useStateCheckEquality: React.useState,
      },
      'common/envs/constants': {
        AUTH_COOKIE_NAME: 'auth',
        BANNED_TRADING_USER_IDS: [],
        TEN_YEARS_SECS: 315360000,
      },
      'web/lib/util/cookie': { getCookie: noop, setCookie: noop },
      'web/lib/native/native-messages': {
        nativePassUsers: noop,
        nativeSetStreak: noop,
        nativeSignOut: noop,
      },
      'web/lib/native/is-native': {
        clearLocalStoragePreservingNativeInfo: noop,
      },
      'common/native-message': { streakBonusPerDay: () => 0 },
      'web/lib/util/local': { safeLocalStorage: undefined },
      'web/hooks/use-save-visits': { getSavedContractVisitsLocally: () => [] },
      'web/hooks/use-user': {
        useWebsocketUser: noop,
        useWebsocketPrivateUser: noop,
      },
      'client-common/hooks/use-websocket-user': {
        trackUserChanges: () => ({ since: {}, stop: noop }),
      },
      'web/hooks/use-effect-check-equality': {
        useEffectCheckEquality: React.useEffect,
      },
      'web/lib/supabase/users': {
        getUserSafe: async (id) => ({ id }),
        getPrivateUserSafe: async () => ({ id: auth.currentUser.uid }),
      },
      'react-hot-toast': { default: { success: noop } },
      'web/lib/util/device-token': { ensureDeviceToken: () => 'device' },
      './layout/row': { Row: noop },
      './widgets/token-number': { TokenNumber: noop },
      'web/lib/supabase/db': supabase,
      'common/util/api': { setLocalOnlyUserId: noop },
    },
    { ...globals, process: { env: {} }, console: { error: noop } }
  )
  const probe = await mount(() =>
    AuthProvider({ children: null, serverUser: null })
  )
  return {
    db,
    realtime,
    probe,
    request: (fn) => {
      tokenRequest = fn
    },
    change: (uid) => {
      auth.currentUser = uid
        ? {
            uid,
            toJSON: () => ({ uid, stsTokenManager: {} }),
            getIdToken: async () => 'firebase-token',
          }
        : null
      return listener(auth.currentUser)
    },
  }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

test('same-user refresh failure retains the JWT, and a later refresh replaces it', async () => {
  const f = await authFixture()
  await act(async () => f.change('alice'))
  assert.equal(f.db.rest.headers.Authorization, 'Bearer jwt-alice')
  const calls = f.realtime.length
  f.request(async () => {
    throw new Error('temporary network failure')
  })
  await act(async () => f.change('alice'))
  assert.equal(f.db.rest.headers.Authorization, 'Bearer jwt-alice')
  assert.equal(f.realtime.length, calls)
  assert.equal(f.probe.value.props.value.authLoaded, true)
  f.request(async () => ({ jwt: 'refreshed-alice' }))
  await act(async () => f.change('alice'))
  assert.equal(f.db.rest.headers.Authorization, 'Bearer refreshed-alice')
})

test('account change clears the previous JWT immediately, even if new credentials fail', async () => {
  const f = await authFixture()
  await act(async () => f.change('alice'))
  const next = deferred()
  f.request(() => next.promise)
  let pending
  await act(async () => {
    pending = f.change('bob')
  })
  assert.equal(f.db.rest.headers.Authorization, undefined)
  assert.equal(f.realtime.at(-1), null)
  assert.equal(f.probe.value.props.value.authLoaded, false)
  await act(async () => {
    next.reject(new Error('offline'))
    await pending
  })
  assert.equal(f.db.rest.headers.Authorization, undefined)
  assert.equal(f.probe.value.props.value.user.id, 'bob')
  f.request(async () => ({ jwt: 'jwt-bob' }))
  await act(async () => f.change('bob'))
  assert.equal(f.db.rest.headers.Authorization, 'Bearer jwt-bob')
})

for (const nextUser of [null, 'bob']) {
  test(`a late refresh cannot restore Alice's credentials after ${
    nextUser ? 'switching accounts' : 'logout'
  }`, async () => {
    const f = await authFixture()
    await act(async () => f.change('alice'))
    const old = deferred()
    f.request(() => old.promise)
    let pending
    await act(async () => {
      pending = f.change('alice')
    })
    f.request(async () => ({ jwt: 'jwt-bob' }))
    await act(async () => f.change(nextUser))
    const expected = nextUser ? 'Bearer jwt-bob' : undefined
    assert.equal(f.db.rest.headers.Authorization, expected)
    await act(async () => {
      old.resolve({ jwt: 'stale-alice' })
      await pending
    })
    assert.equal(f.db.rest.headers.Authorization, expected)
    assert.equal(f.probe.value.props.value?.user.id ?? null, nextUser)
  })
}
