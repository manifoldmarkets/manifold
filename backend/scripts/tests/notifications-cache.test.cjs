// The notifications cache in localStorage, through the real hooks and storage
// wrapper: node --test backend/scripts/tests/notifications-cache.test.cjs
const assert = require('node:assert/strict')
const { test, afterEach } = require('node:test')
const { JSDOM } = require('./runtime/node_modules/jsdom')
const React = require('react')
const { createRoot } = require('react-dom/client')
const lodash = require('lodash')
const { load } = require('./load-ts.cjs')
const { act } = React
const dom = new JSDOM('<body></body>', { url: 'https://manifold.markets/' })
global.window = dom.window
global.document = dom.window.document
global.IS_REACT_ACT_ENVIRONMENT = true

// In code units, like browsers. Chromium allows about 5.2M; small keeps it fast.
const QUOTA = 600_000
const USER = 'user1'
const KEY = 'notifications-' + USER
const PINNED = 3

const json = load('common/src/util/json.ts', {})
const useEvent = load('client-common/src/hooks/use-event.ts', {
  react: React,
  'client-common/hooks/use-safe-layout-effect': {
    useSafeLayoutEffect: React.useLayoutEffect,
  },
})

const newStorage = () =>
  new JSDOM('', { url: 'https://manifold.markets/', storageQuota: QUOTA })
    .window.localStorage

// One page load: fresh modules over the given localStorage.
function page(storage) {
  const warnings = []
  const local = load(
    'web/lib/util/local.ts',
    {},
    {
      localStorage: storage,
      sessionStorage: newStorage(),
      console: { warn: (...args) => warnings.push(args.join(' ')) },
    }
  )
  const persistent = load('web/hooks/use-persistent-local-state.ts', {
    react: React,
    'common/util/json': json,
    'web/lib/util/local': local,
    'client-common/hooks/use-persistent-in-memory-state': {
      isFunction: (v) => typeof v === 'function',
    },
    'client-common/hooks/use-event': useEvent,
    'web/hooks/use-is-client': { useIsClient: () => true },
  })
  const broadcasts = new Map()
  const hooks = load(
    'client-common/src/hooks/use-notifications.ts',
    {
      react: React,
      lodash,
      'client-common/hooks/use-api-subscription': {
        useApiSubscription: ({ topics, onBroadcast }) =>
          broadcasts.set(topics[0], onBroadcast),
      },
    },
    { console: { log() {} } }
  )
  const usePersistentLocalState = persistent.usePersistentLocalState
  return {
    safeLocalStorage: local.safeLocalStorage,
    warnings,
    // The nav bell's hook and the notifications page's.
    useBell: (api) =>
      hooks.useGroupedUnseenNotifications(USER, api, usePersistentLocalState),
    usePage: (api) =>
      hooks.useGroupedNotifications(
        { id: USER, username: USER },
        api,
        usePersistentLocalState
      ),
    broadcast: (notification) =>
      act(async () =>
        broadcasts.get(`user-notifications/${USER}`)({ data: { notification } })
      ),
  }
}

// Like get-notifications: every pinned one, plus the newest `limit` others
// created after `after`.
function server(notifications) {
  const requests = []
  const api = async ({ limit, after }) => {
    requests.push({ limit, after })
    const recent = notifications
      .filter(
        (n) =>
          n.markedAsRead !== false && (after == null || n.createdTime > after)
      )
      .sort((a, b) => b.createdTime - a.createdTime)
      .slice(0, limit)
    return [...notifications.filter((n) => n.markedAsRead === false), ...recent]
  }
  return { api, requests }
}

const notification = (id, createdTime, other = {}) => ({
  id,
  userId: USER,
  reason: 'all_comments_on_my_markets',
  createdTime,
  isSeen: true,
  sourceType: 'comment',
  sourceContractId: 'market' + (createdTime % 50),
  sourceTitle: 'Will it happen?',
  sourceText: 'A comment on your market. '.repeat(6),
  ...other,
})

// Months of notifications, the oldest few pinned, filling all but `spare` of
// the quota, as the cache used to before it had a cap.
function monthsOfNotifications(spare) {
  const size = JSON.stringify(notification('old0', 0)).length + 1
  return Array.from({ length: Math.floor((QUOTA - spare) / size) }, (_, i) =>
    notification('old' + i, 1000 + i, i < PINNED ? { markedAsRead: false } : {})
  )
}

// A week away: all newer than anything cached.
const weekOfNotifications = () =>
  Array.from({ length: 500 }, (_, i) =>
    notification('new' + i, 1_000_000 + i, { isSeen: false })
  )

const mounted = []
afterEach(async () => {
  await act(async () => mounted.splice(0).forEach((root) => root.unmount()))
})
const settle = () => new Promise((resolve) => setImmediate(resolve))

// Renders the hooks and lets the fetches land. Errors that would take down
// the page are collected rather than thrown.
async function mount(render) {
  const errors = []
  const root = createRoot(document.createElement('div'), {
    onUncaughtError: (error) => errors.push(String(error)),
  })
  mounted.push(root)
  function Probe() {
    render()
    return null
  }
  try {
    await act(async () => root.render(React.createElement(Probe)))
    await act(settle)
    await act(settle)
  } catch (error) {
    errors.push(String(error))
  }
  return errors
}

test('a week of notifications on a nearly full cache neither crashes nor wipes storage', async () => {
  const months = monthsOfNotifications(50_000)
  const storage = newStorage()
  storage.setItem(KEY, JSON.stringify(months))
  storage.setItem('draft', 'an unsent comment')
  const { api } = server([...months, ...weekOfNotifications()])
  const p = page(storage)

  let pageGroups
  const errors = await mount(() => {
    p.useBell(api)
    pageGroups = p.usePage(api).groupedNotifications
  })

  assert.deepEqual(errors, [])
  assert(pageGroups.length > 0)
  assert.equal(storage.getItem('draft'), 'an unsent comment')
  const saved = JSON.parse(storage.getItem(KEY))
  // The 450 newest, plus the pinned ones however old, newest first.
  assert.equal(saved.length, 450 + PINNED)
  assert.equal(saved.filter((n) => n.id.startsWith('new')).length, 450)
  assert.equal(saved.filter((n) => n.markedAsRead === false).length, PINNED)
  assert(
    saved.every((n, i) => i === 0 || saved[i - 1].createdTime >= n.createdTime)
  )
})

test('a cache that filled storage to the last code unit shrinks on the next load', async () => {
  const months = monthsOfNotifications(50_000)
  const storage = newStorage()
  storage.setItem(KEY, JSON.stringify(months))
  // Other keys take the rest, as a write that just fit can leave it.
  const used = KEY.length + storage.getItem(KEY).length
  storage.setItem('filler', 'x'.repeat(QUOTA - used - 'filler'.length))
  assert.throws(() => storage.setItem('t', ''), /quota/)
  const { api } = server([...months, ...weekOfNotifications()])
  const p = page(storage)

  assert.deepEqual(await mount(() => p.usePage(api)), [])
  assert.equal(JSON.parse(storage.getItem(KEY)).length, 450 + PINNED)
})

test('broadcasts are capped and deduped, and keep pinned notifications', async () => {
  const pinned = notification('pinned', 1, { markedAsRead: false })
  const regular = Array.from({ length: 600 }, (_, i) =>
    notification('n' + i, 100 + i)
  )
  const storage = newStorage()
  const { api } = server([pinned, ...regular])
  const p = page(storage)
  assert.deepEqual(await mount(() => p.usePage(api)), [])

  const newest = notification('newest', 10_000)
  await p.broadcast(newest)
  await p.broadcast(newest)

  const saved = JSON.parse(storage.getItem(KEY))
  assert.equal(saved.length, 451)
  assert.equal(saved[0].id, 'newest')
  assert.equal(saved.filter((n) => n.id === 'newest').length, 1)
  assert(saved.some((n) => n.id === 'pinned'))
  // The fetch returned n150 to n599; the broadcast pushed out the oldest.
  assert(!saved.some((n) => n.id === 'n150'))
  assert(saved.some((n) => n.id === 'n151'))
})

test('the bell asks only for notifications newer than the newest cached one', async () => {
  const cached = [notification('a', 100), notification('b', 200)]
  const storage = newStorage()
  storage.setItem(KEY, JSON.stringify(cached))
  // Saved by earlier versions, which kept the cursor separately. It can be
  // ahead of the list if a save of the list failed, so it's no longer read.
  storage.setItem('latest-notification-time-' + USER, '999')
  const { api, requests } = server([...cached, notification('c', 300)])
  const p = page(storage)

  assert.deepEqual(await mount(() => p.useBell(api)), [])
  assert.deepEqual(requests, [{ limit: 30, after: 200 }])
  const saved = JSON.parse(storage.getItem(KEY))
  assert.deepEqual(
    Array.from(saved, (n) => n.id),
    ['c', 'b', 'a']
  )
})

test('a value that does not fit is skipped without throwing or clearing storage', () => {
  const storage = newStorage()
  storage.setItem('draft', 'an unsent comment')
  const p = page(storage)

  p.safeLocalStorage.setItem('big', 'x'.repeat(QUOTA))

  assert.equal(storage.getItem('big'), null)
  assert.equal(storage.getItem('draft'), 'an unsent comment')
  assert.equal(p.warnings.length, 1)
})
