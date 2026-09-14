// Run with: node --test web/lib/util/local.test.cjs
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

function loadStorage(storage) {
  const exports = {}
  vm.runInNewContext(source, {
    exports,
    localStorage: storage,
    sessionStorage: storage,
    console: { warn() {} },
  })
  return exports
}

function createStorage() {
  const data = new Map()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
    clear: () => data.clear(),
  }
}

for (const name of ['safeLocalStorage', 'safeSessionStorage']) {
  test(`${name}: reads, writes, and removes values`, () => {
    const safe = loadStorage(createStorage())[name]
    assert.equal(safe.getItem('missing'), null)
    safe.setItem('key', 'value')
    assert.equal(safe.getItem('key'), 'value')
    safe.removeItem('key')
    assert.equal(safe.getItem('key'), null)
  })

  test(`${name}: an oversized write does not throw or erase other data`, () => {
    const storage = createStorage()
    const safe = loadStorage(storage)[name]
    safe.setItem('draft', 'unsent comment')
    safe.setItem('notifications-user', 'previous notifications')
    const originalSetItem = storage.setItem
    storage.setItem = () => {
      throw new DOMException('Storage is full', 'QuotaExceededError')
    }

    assert.doesNotThrow(() => safe.setItem('notifications-user', 'too large'))
    assert.equal(safe.getItem('draft'), 'unsent comment')
    assert.equal(safe.getItem('notifications-user'), 'previous notifications')

    storage.setItem = originalSetItem
    safe.setItem('notifications-user', 'smaller value')
    assert.equal(safe.getItem('notifications-user'), 'smaller value')
  })

  test(`${name}: storage already full at startup remains readable`, () => {
    const storage = createStorage()
    storage.setItem('draft', 'unsent comment')
    storage.setItem = () => {
      throw new DOMException('Storage is full', 'QuotaExceededError')
    }
    const safe = loadStorage(storage)[name]
    assert.equal(safe.getItem('draft'), 'unsent comment')
    assert.doesNotThrow(() => safe.setItem('notifications-user', 'too large'))
  })

  test(`${name}: later storage access failures do not escape`, () => {
    const storage = createStorage()
    const safe = loadStorage(storage)[name]
    for (const method of ['getItem', 'setItem', 'removeItem']) {
      storage[method] = () => {
        throw new DOMException('Storage access denied', 'SecurityError')
      }
    }
    assert.equal(safe.getItem('key'), null)
    assert.doesNotThrow(() => safe.setItem('key', 'value'))
    assert.doesNotThrow(() => safe.removeItem('key'))
  })
}

test('importing without browser storage is safe', () => {
  const exports = {}
  vm.runInNewContext(source, { exports })
  assert.equal(exports.safeLocalStorage, undefined)
  assert.equal(exports.safeSessionStorage, undefined)
})
