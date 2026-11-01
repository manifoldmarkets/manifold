// Exercise the actual browser storage adapters without network or a signed-in
// browser: node --test backend/scripts/tests/browse-rollout-client.test.cjs
const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const root = path.resolve(__dirname, '../../..')

function load(file, dependencies, globals = {}) {
  const exports = {}
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }).outputText,
    {
      exports,
      ...globals,
      require(id) {
        if (Object.prototype.hasOwnProperty.call(dependencies, id))
          return dependencies[id]
        throw new Error(`Unexpected dependency: ${id}`)
      },
    }
  )
  return exports
}
const random = load('common/src/util/random.ts', {})
const abTest = load('common/src/ab-test.ts', { './util/random': random })
const rules = load('common/src/browse-rollout.ts', { './ab-test': abTest })
const json = load('common/src/util/json.ts', {})

function fixture(entries = {}) {
  const values = new Map(Object.entries(entries))
  const store = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
  }
  const token = load('web/lib/util/device-token.ts', {
    'common/util/random': { randomString: () => 'new-browser-token' },
    'common/browse-rollout': rules,
    'common/util/json': json,
    './local': { safeLocalStorage: store },
  })
  return { store, token }
}

test('analytics creating the token before Browse does not lose new-visitor eligibility', () => {
  const { token } = fixture()
  token.ensureDeviceToken()
  const first = token.getDeviceHistory()
  assert.equal(first.deviceId, 'new-browser-token')
  assert.ok(first.firstSeenTime > 0)
  token.ensureDeviceToken()
  assert.deepEqual(token.getDeviceHistory(), first)
  assert.equal(
    rules.enrollBrowseVisitor({ history: first, now: Date.now() }).cohort,
    'new-visitor'
  )
})

test('a pre-rollout token gets an unknown historical date, never a fresh one', () => {
  const { token } = fixture({ 'device-token': 'returning-browser' })
  token.ensureDeviceToken()
  assert.equal(token.getDeviceHistory().firstSeenTime, null)
  assert.equal(
    rules.enrollBrowseVisitor({
      history: token.getDeviceHistory(),
      now: Date.now(),
    }).cohort,
    'returning-visitor'
  )
})

test('malformed history on an existing token fails conservatively', () => {
  const { token } = fixture({
    'device-token': 'old-browser',
    [rules.DEVICE_HISTORY_KEY]: '{broken',
  })
  assert.equal(token.getDeviceHistory().firstSeenTime, null)
})

test('blocked local storage does not enroll a new randomized visitor', () => {
  const token = load('web/lib/util/device-token.ts', {
    'common/util/random': { randomString: () => 'ephemeral' },
    'common/browse-rollout': rules,
    'common/util/json': json,
    './local': { safeLocalStorage: undefined },
  })
  assert.equal(token.getDeviceHistory(), undefined)
  assert.equal(
    rules.enrollBrowseVisitor({
      history: token.getDeviceHistory(),
      now: Date.now(),
    }).variant,
    null
  )
})

test('logout clears account data while preserving the browser assignment and choice', () => {
  const { store, token } = fixture({
    CACHED_USER_KEY_V2: 'private account data',
    'is-native': 'true',
  })
  const history = token.getDeviceHistory()
  const enrollment = rules.enrollBrowseVisitor({ history, now: Date.now() })
  store.setItem(rules.BROWSE_ENROLLMENT_KEY, JSON.stringify(enrollment))
  store.setItem(rules.BROWSE_CHOICE_KEY, JSON.stringify('legacy'))
  const native = load(
    'web/lib/native/is-native.ts',
    {
      'common/native-message': {
        IS_NATIVE_KEY: 'is-native',
        PLATFORM_KEY: 'native-platform',
        NATIVE_INFO_LOCAL_KEYS: ['is-native'],
      },
      'common/browse-rollout': rules,
      lodash: { uniq: (items) => [...new Set(items)] },
      'web/lib/util/local': {
        safeLocalStorage: store,
        safeSessionStorage: store,
      },
      '../api/api': {},
    },
    { window: {}, localStorage: store }
  )
  native.clearLocalStoragePreservingNativeInfo()
  assert.equal(store.getItem('CACHED_USER_KEY_V2'), null)
  assert.equal(store.getItem('is-native'), 'true')
  assert.equal(store.getItem(rules.BROWSE_CHOICE_KEY), '"legacy"')
  assert.equal(
    store.getItem(rules.BROWSE_ENROLLMENT_KEY),
    JSON.stringify(enrollment)
  )
  assert.deepEqual(token.getDeviceHistory(), history)
})
