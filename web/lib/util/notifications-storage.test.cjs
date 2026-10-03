const assert = require('node:assert/strict')
const { test } = require('node:test')
const {
  createStorage,
  loadStores,
  loadTypeScript,
} = require('./storage-test-helpers.cjs')
const lodash = require('lodash')

// Execute the actual notification and persistence hooks with a small scheduler.
// State updates and dependency-aware mount effects survive rerenders; creating
// a new scheduler simulates navigation and recreating stores simulates reload.
async function mountNotifications(stores, server, options = {}) {
  const values = []
  const dependencies = []
  const effects = []
  const subscriptions = new Map()
  const requests = []
  let stateIndex = 0
  let effectIndex = 0
  let dirty = true
  let output
  const react = {
    useState(initial) {
      const index = stateIndex++
      if (!(index in values)) values[index] = initial
      return [
        values[index],
        (update) => {
          const next =
            typeof update === 'function' ? update(values[index]) : update
          if (!Object.is(next, values[index])) {
            values[index] = next
            dirty = true
          }
        },
      ]
    },
    useEffect(effect, deps) {
      const index = effectIndex++
      if (
        !dependencies[index] ||
        deps.some((dep, i) => !Object.is(dep, dependencies[index][i]))
      ) {
        dependencies[index] = deps
        effects.push(effect)
      }
    },
  }
  const persistent = loadTypeScript(
    'web/hooks/use-persistent-local-state.ts',
    {},
    {
      react,
      'web/lib/util/local': stores,
      'common/util/json': {
        safeJsonParse: (value) => (value == null ? null : JSON.parse(value)),
      },
      'client-common/hooks/use-persistent-in-memory-state': {
        isFunction: (value) => typeof value === 'function',
      },
      'client-common/hooks/use-event': { useEvent: (fn) => fn },
      'web/hooks/use-is-client': { useIsClient: () => true },
    }
  )
  const hook = loadTypeScript(
    'client-common/src/hooks/use-notifications.ts',
    {},
    {
      react,
      lodash,
      'client-common/hooks/use-api-subscription': {
        useApiSubscription({ topics, onBroadcast }) {
          subscriptions.set(topics[0], onBroadcast)
        },
      },
    }
  )
  const api = async (params) => {
    requests.push(params)
    const regular = server
      .filter(
        (n) =>
          n.markedAsRead !== false &&
          (params.after == null || n.createdTime > params.after)
      )
      .sort((a, b) => b.createdTime - a.createdTime)
      .slice(0, params.limit)
    return [...server.filter((n) => n.markedAsRead === false), ...regular]
  }
  async function flush() {
    for (let iteration = 0; iteration < 20; iteration++) {
      if (dirty) {
        dirty = false
        stateIndex = 0
        effectIndex = 0
        output = hook.useNotifications(
          options.userId ?? 'user',
          api,
          persistent.usePersistentLocalState,
          options.count ?? 30,
          options.newOnly ?? true
        )
      }
      effects.splice(0).forEach((effect) => effect())
      await Promise.resolve()
      await Promise.resolve()
      if (!dirty && !effects.length) return
    }
    throw new Error('Hooks failed to settle')
  }
  await flush()
  return {
    get notifications() {
      return output.notifications
    },
    requests,
    async broadcast(notification) {
      subscriptions.get(`user-notifications/${options.userId ?? 'user'}`)({
        data: { notification },
      })
      await flush()
    },
  }
}

const notification = (id, createdTime, other = {}) => ({
  id,
  createdTime,
  isSeen: false,
  ...other,
})

test('quota failure keeps notifications across navigation and refetches them after reload', async () => {
  const old = notification('old', 100)
  const recent = notification('new', 200, { sourceText: 'x'.repeat(500) })
  const storage = createStorage({
    'notifications-user': JSON.stringify([old]),
    'latest-notification-time-user': '999', // stale cursor left by the original PR
    draft: 'x'.repeat(2000),
  })
  storage.quota = storage.bytes
  const stores = loadStores(storage)
  const first = await mountNotifications(stores, [old, recent])
  assert.equal(first.requests[0].after, 100)
  assert(first.notifications.some((n) => n.id === 'new'))
  assert.equal(storage.getItem('notifications-user'), null)
  assert.equal(storage.getItem('draft'), 'x'.repeat(2000))
  const navigation = await mountNotifications(stores, [old, recent])
  assert(navigation.notifications.some((n) => n.id === 'new'))
  const reload = await mountNotifications(loadStores(storage), [old, recent])
  assert.equal(reload.requests[0].after, undefined)
  assert(reload.notifications.some((n) => n.id === 'new'))
})

test('denied cache writes never advance the persisted fetch cursor', async () => {
  const old = notification('old', 100)
  const recent = notification('new', 200)
  const storage = createStorage({
    'notifications-user': JSON.stringify([old]),
    'latest-notification-time-user': '999',
  })
  storage.failures.add('setItem')
  const first = await mountNotifications(loadStores(storage), [old, recent])
  assert(first.notifications.some((n) => n.id === 'new'))
  assert.equal(JSON.parse(storage.getItem('notifications-user')).length, 1)
  const reload = await mountNotifications(loadStores(storage), [old, recent])
  assert.equal(reload.requests[0].after, 100)
  assert(reload.notifications.some((n) => n.id === 'new'))
})

test('existing caches shrink to 450 regular notifications while retaining old pins', async () => {
  const regular = Array.from({ length: 600 }, (_, i) =>
    notification(`n${i}`, i + 100)
  )
  const pinned = notification('pinned', 1, { markedAsRead: false })
  const storage = createStorage({
    'notifications-user': JSON.stringify([...regular, pinned]),
  })
  storage.quota = storage.bytes
  const view = await mountNotifications(loadStores(storage), [
    ...regular,
    pinned,
  ])
  const saved = JSON.parse(storage.getItem('notifications-user'))
  assert.equal(saved.length, 451)
  assert(saved.some((n) => n.id === 'pinned'))
  assert.equal(saved.filter((n) => n.markedAsRead !== false).length, 450)
  assert(saved.some((n) => n.id === 'n599'))
  assert(!saved.some((n) => n.id === 'n0'))
  assert(storage.bytes < storage.quota)
  await view.broadcast(notification('newest', 1000))
  await view.broadcast(notification('newest', 1000))
  await view.broadcast(notification('late-arrival', 2))
  assert.equal(view.notifications.length, 451)
  assert.equal(view.notifications.filter((n) => n.id === 'newest').length, 1)
  assert(view.notifications.some((n) => n.id === 'pinned'))
  assert(!view.notifications.some((n) => n.id === 'late-arrival'))
})

test('large pinned payloads remain visible without exceeding the disk cache budget', async () => {
  const pinned = notification('pinned', 1, {
    markedAsRead: false,
    sourceText: 'x'.repeat(600 * 1024),
  })
  const recent = notification('recent', 200)
  const storage = createStorage({ draft: 'keep' })
  const first = await mountNotifications(loadStores(storage), [pinned, recent])
  assert.equal(first.notifications.length, 2)
  assert.equal(storage.getItem('notifications-user'), null)
  const reload = await mountNotifications(loadStores(storage), [pinned, recent])
  assert(reload.notifications.some((n) => n.id === 'pinned'))
  assert.equal(storage.getItem('draft'), 'keep')
})

test('account caches are separate and logout discards pending notification writes', async () => {
  const storage = createStorage()
  storage.quota = 0
  const stores = loadStores(storage)
  const old = await mountNotifications(
    stores,
    [notification('old-account-notif', 100)],
    { userId: 'old' }
  )
  assert.equal(old.notifications.length, 1)
  stores.safeLocalStorage.clear()
  const next = await mountNotifications(
    stores,
    [notification('new-account-notif', 200)],
    { userId: 'new' }
  )
  assert.equal(stores.safeLocalStorage.getItem('notifications-old'), null)
  assert.deepEqual(
    Array.from(next.notifications, (n) => n.id),
    ['new-account-notif']
  )
})
