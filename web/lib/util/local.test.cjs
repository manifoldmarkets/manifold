// Run with: yarn test:storage
const assert = require('node:assert/strict')
const { test } = require('node:test')
const {
  createStorage,
  loadStores,
  loadTypeScript,
} = require('./storage-test-helpers.cjs')

for (const name of ['safeLocalStorage', 'safeSessionStorage']) {
  const load = (storage) =>
    loadStores(
      name === 'safeLocalStorage' ? storage : createStorage(),
      name === 'safeSessionStorage' ? storage : createStorage()
    )[name]

  test(`${name}: reads, writes, removes, and clears values`, () => {
    const safe = load(createStorage())
    assert.equal(safe.getItem('missing'), null)
    safe.setItem('key', 'value')
    assert.equal(safe.getItem('key'), 'value')
    safe.removeItem('key')
    assert.equal(safe.getItem('key'), null)
    safe.setItem('key', 'again')
    safe.clear()
    assert.equal(safe.getItem('key'), null)
  })

  test(`${name}: failed writes remain readable and can later persist`, () => {
    const storage = createStorage({ draft: 'unsent comment', theme: 'light' })
    storage.quota = storage.bytes
    const safe = load(storage)
    safe.setItem('theme', 'a much longer theme name')
    assert.equal(safe.getItem('theme'), 'a much longer theme name')
    assert.equal(storage.getItem('theme'), 'light')
    assert.equal(storage.getItem('draft'), 'unsent comment')
    storage.quota = Infinity
    safe.setItem('theme', 'dark')
    assert.equal(storage.getItem('theme'), 'dark')
    assert.equal(safe.getItem('theme'), 'dark')
  })

  test(`${name}: undefined state serializations retain Web Storage semantics`, () => {
    const storage = createStorage()
    const safe = load(storage)
    safe.setItem('notifications-user', JSON.stringify(undefined))
    assert.equal(safe.getItem('notifications-user'), 'undefined')
    storage.failures.add('setItem')
    safe.setItem('notifications-other', JSON.stringify(undefined))
    assert.equal(safe.getItem('notifications-other'), 'undefined')
  })

  test(`${name}: quota recovery evicts only notification caches and retries`, () => {
    const storage = createStorage({
      'notifications-user': 'x'.repeat(1000),
      'notifications-other-user': 'y'.repeat(1000),
      'latest-notification-time-user': '123',
      'notifications-seen-time': '120',
      draft: 'unsent comment',
      theme: 'light',
      'native-platform': 'ios',
    })
    storage.quota = storage.bytes
    const safe = load(storage)
    safe.setItem('draft', 'a longer unsent comment')
    assert.equal(storage.getItem('draft'), 'a longer unsent comment')
    assert.equal(storage.getItem('notifications-user'), null)
    assert.equal(storage.getItem('notifications-other-user'), null)
    assert.equal(storage.getItem('latest-notification-time-user'), null)
    assert.equal(safe.getItem('notifications-user'), 'x'.repeat(1000))
    assert.equal(storage.getItem('notifications-seen-time'), '120')
    assert.equal(storage.getItem('theme'), 'light')
    assert.equal(storage.getItem('native-platform'), 'ios')
    assert.equal(storage.writes, 2)
  })

  test(`${name}: full storage at startup stays readable without a write probe`, () => {
    const storage = createStorage({ draft: 'unsent comment' })
    storage.quota = storage.bytes
    const safe = load(storage)
    assert.equal(storage.writes, 0)
    assert.equal(safe.getItem('draft'), 'unsent comment')
    safe.setItem('new-key', 'value')
    assert.equal(safe.getItem('new-key'), 'value')
  })

  test(`${name}: oversized notification payloads stay in memory and free old cache`, () => {
    const storage = createStorage({
      'notifications-user': 'previous',
      draft: 'keep',
    })
    const safe = load(storage)
    const huge = 'x'.repeat(600 * 1024)
    safe.setItem('notifications-user', huge)
    assert.equal(safe.getItem('notifications-user'), huge)
    assert.equal(storage.getItem('notifications-user'), null)
    assert.equal(storage.getItem('draft'), 'keep')
    assert.equal(storage.writes, 0)
  })

  test(`${name}: denied reads/writes/removals are safe and deletions hide stale values`, () => {
    const storage = createStorage({ account: 'old' })
    const safe = load(storage)
    storage.failures.add('setItem')
    safe.setItem('account', 'new')
    assert.equal(safe.getItem('account'), 'new')
    storage.failures.add('removeItem')
    safe.removeItem('account')
    assert.equal(safe.getItem('account'), null)
    storage.failures.add('getItem')
    assert.equal(safe.getItem('missing'), null)
  })

  test(`${name}: failed logout clear hides disk and pending values across account switch`, () => {
    const storage = createStorage({
      account: 'old',
      'notifications-old': 'x'.repeat(1000),
    })
    const safe = load(storage)
    storage.failures.add('setItem')
    safe.setItem('account', 'pending-old')
    storage.failures.delete('setItem')
    storage.failures.add('clear')
    safe.clear()
    assert.equal(safe.getItem('account'), null)
    assert.equal(safe.getItem('notifications-old'), null)
    storage.quota = storage.bytes
    safe.setItem('new-account', 'new')
    assert.equal(safe.getItem('new-account'), 'new')
    assert.equal(safe.getItem('notifications-old'), null)
    safe.setItem('account', 'replacement')
    assert.equal(safe.getItem('account'), 'replacement')
  })
}

test('local and session storage are independent', () => {
  const stores = loadStores(createStorage(), createStorage())
  stores.safeLocalStorage.setItem('key', 'local')
  stores.safeSessionStorage.setItem('key', 'session')
  assert.equal(stores.safeLocalStorage.getItem('key'), 'local')
  assert.equal(stores.safeSessionStorage.getItem('key'), 'session')
})

test('blocked browser storage getters use independent memory stores', () => {
  const stores = loadTypeScript('web/lib/util/local.ts', {
    window: {},
    get localStorage() {
      throw new DOMException('Denied', 'SecurityError')
    },
    get sessionStorage() {
      throw new DOMException('Denied', 'SecurityError')
    },
  })
  stores.safeLocalStorage.setItem('device-token', 'stable')
  assert.equal(stores.safeLocalStorage.getItem('device-token'), 'stable')
  assert.equal(stores.safeSessionStorage.getItem('device-token'), null)
})

test('server imports do not create shared user storage', () => {
  const stores = loadTypeScript('web/lib/util/local.ts')
  assert.equal(stores.safeLocalStorage, undefined)
  assert.equal(stores.safeSessionStorage, undefined)
})

test('logout clears pending account data and preserves native flags even when clear throws', () => {
  const storage = createStorage({
    account: 'old',
    'is-native': 'true',
    platform: 'ios',
    'native-platform': 'ios',
  })
  const stores = loadStores(storage)
  storage.failures.add('setItem')
  stores.safeLocalStorage.setItem('account', 'pending-old')
  storage.failures.add('clear')
  const native = loadTypeScript(
    'web/lib/native/is-native.ts',
    { window: {} },
    {
      'web/lib/util/local': stores,
      'common/native-message': {
        IS_NATIVE_KEY: 'is-native',
        PLATFORM_KEY: 'platform',
        NATIVE_INFO_LOCAL_KEYS: ['is-native', 'platform', 'native-platform'],
      },
      lodash: {},
      '../api/api': {},
    }
  )
  native.clearLocalStoragePreservingNativeInfo()
  assert.equal(stores.safeLocalStorage.getItem('account'), null)
  assert.equal(stores.safeLocalStorage.getItem('native-platform'), 'ios')
  assert.equal(native.getIsNative(), true)
})
