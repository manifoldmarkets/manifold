// Run with: yarn --cwd=web test
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')

const source = ts.transpileModule(
  readFileSync(join(__dirname, 'local.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } }
).outputText

// Distinct backing stores, so a local/session wiring mixup fails the suite.
function loadStorage({ local = createStorage(), session = createStorage() } = {}) {
  const exports = {}
  vm.runInNewContext(source, {
    exports,
    localStorage: local,
    sessionStorage: session,
    console: { warn() {} },
  })
  return { ...exports, local, session }
}

// Models a real browser store: a byte budget over the whole store, where
// overwriting a key replaces its old value rather than adding to it.
function createStorage(quota = Infinity) {
  const data = new Map()
  const size = (key, value) => key.length + value.length
  let used = 0
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      const previous = data.has(key) ? size(key, data.get(key)) : 0
      const next = used - previous + size(key, value)
      if (next > quota) {
        throw new DOMException('Storage is full', 'QuotaExceededError')
      }
      data.set(key, value)
      used = next
    },
    removeItem: (key) => {
      if (!data.has(key)) return
      used -= size(key, data.get(key))
      data.delete(key)
    },
    clear: () => {
      data.clear()
      used = 0
    },
  }
}

function denyAccess(storage) {
  for (const method of ['getItem', 'setItem', 'removeItem', 'clear']) {
    storage[method] = () => {
      throw new DOMException('Storage access denied', 'SecurityError')
    }
  }
}

for (const name of ['safeLocalStorage', 'safeSessionStorage']) {
  const backing = name === 'safeLocalStorage' ? 'local' : 'session'

  test(`${name}: reads, writes, and removes values`, () => {
    const loaded = loadStorage()
    const safe = loaded[name]
    assert.equal(safe.getItem('missing'), null)
    safe.setItem('key', 'value')
    assert.equal(safe.getItem('key'), 'value')
    // Actually persisted, not just held in memory.
    assert.equal(loaded[backing].getItem('key'), 'value')
    safe.removeItem('key')
    assert.equal(safe.getItem('key'), null)
    assert.equal(loaded[backing].getItem('key'), null)
  })

  test(`${name}: writes to the store it is wired to, and no other`, () => {
    const loaded = loadStorage()
    loaded[name].setItem('key', 'value')
    const other = backing === 'local' ? 'session' : 'local'
    assert.equal(loaded[backing].getItem('key'), 'value')
    assert.equal(loaded[other].getItem('key'), null)
  })

  test(`${name}: an oversized write does not throw or erase other data`, () => {
    const storage = createStorage(120)
    const loaded = loadStorage({ [backing]: storage })
    const safe = loaded[name]
    safe.setItem('draft', 'unsent comment')
    safe.setItem('notifications-user', 'x'.repeat(60))

    assert.doesNotThrow(() =>
      safe.setItem('notifications-user', 'y'.repeat(200))
    )
    // Unrelated data survives — we never clear the store.
    assert.equal(safe.getItem('draft'), 'unsent comment')
    assert.equal(storage.getItem('draft'), 'unsent comment')
    // The previously persisted value is left alone rather than deleted.
    assert.equal(storage.getItem('notifications-user'), 'x'.repeat(60))
  })

  test(`${name}: a value that would not fit is still readable this session`, () => {
    const storage = createStorage(120)
    const safe = loadStorage({ [backing]: storage })[name]
    safe.setItem('notifications-user', 'x'.repeat(60))
    safe.setItem('notifications-user', 'y'.repeat(200))

    // Reads see what was written, not the superseded persisted value, so
    // callers can't diverge from the store mid-session.
    assert.equal(safe.getItem('notifications-user'), 'y'.repeat(200))
  })

  test(`${name}: a later write that fits persists and drops the memory copy`, () => {
    const storage = createStorage(120)
    const safe = loadStorage({ [backing]: storage })[name]
    safe.setItem('notifications-user', 'y'.repeat(200))
    assert.equal(safe.getItem('notifications-user'), 'y'.repeat(200))

    safe.setItem('notifications-user', 'trimmed')
    assert.equal(safe.getItem('notifications-user'), 'trimmed')
    assert.equal(storage.getItem('notifications-user'), 'trimmed')
  })

  test(`${name}: removing a value that never persisted clears it`, () => {
    const storage = createStorage(120)
    const safe = loadStorage({ [backing]: storage })[name]
    safe.setItem('notifications-user', 'y'.repeat(200))
    safe.removeItem('notifications-user')
    assert.equal(safe.getItem('notifications-user'), null)
  })

  test(`${name}: a stable token survives a full store for the session`, () => {
    // Regression for ensureDeviceToken(): a dropped write made it mint a new
    // token on every call, so analytics and A/B assignment lost their anchor.
    const safe = loadStorage({ [backing]: createStorage(0) })[name]
    const read = () => {
      let token = safe.getItem('device-token')
      if (!token) {
        token = 'token-' + Math.random()
        safe.setItem('device-token', token)
      }
      return token
    }
    assert.equal(read(), read())
  })

  test(`${name}: storage already full at startup remains readable`, () => {
    const storage = createStorage(40)
    storage.setItem('draft', 'unsent comment')
    const safe = loadStorage({ [backing]: storage })[name]
    assert.equal(safe.getItem('draft'), 'unsent comment')
    assert.doesNotThrow(() => safe.setItem('notifications-user', 'too large'))
    assert.equal(safe.getItem('draft'), 'unsent comment')
  })

  test(`${name}: later storage access failures do not escape`, () => {
    const storage = createStorage()
    const safe = loadStorage({ [backing]: storage })[name]
    denyAccess(storage)
    assert.equal(safe.getItem('key'), null)
    assert.doesNotThrow(() => safe.setItem('key', 'value'))
    assert.doesNotThrow(() => safe.removeItem('key'))
    assert.doesNotThrow(() => safe.clear())
  })

  test(`${name}: clear() empties the store`, () => {
    const loaded = loadStorage()
    const safe = loaded[name]
    safe.setItem('key', 'value')
    safe.clear()
    assert.equal(safe.getItem('key'), null)
    assert.equal(loaded[backing].getItem('key'), null)
  })

  test(`${name}: clear() also drops values held only in memory`, () => {
    const safe = loadStorage({ [backing]: createStorage(0) })[name]
    safe.setItem('key', 'value')
    safe.clear()
    assert.equal(safe.getItem('key'), null)
  })
}

test('importing without browser storage is safe', () => {
  const exports = {}
  vm.runInNewContext(source, { exports })
  assert.equal(exports.safeLocalStorage, undefined)
  assert.equal(exports.safeSessionStorage, undefined)
})

test('newInMemoryStore returns null for a missing key', () => {
  const store = loadStorage().newInMemoryStore()
  assert.equal(store.getItem('missing'), null)
  store.setItem('key', 'value')
  assert.equal(store.getItem('key'), 'value')
  store.removeItem('key')
  assert.equal(store.getItem('key'), null)
})
