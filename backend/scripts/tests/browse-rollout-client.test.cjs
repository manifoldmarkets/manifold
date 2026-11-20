// Exercise the actual browser storage adapters without network or a signed-in
// browser: node --test backend/scripts/tests/browse-rollout-client.test.cjs
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { load } = require('./load-ts.cjs')
const random = load('common/src/util/random.ts', {})
const abTest = load('common/src/ab-test.ts', { './util/random': random })
const rules = load('common/src/browse-rollout.ts', { './ab-test': abTest })
const json = load('common/src/util/json.ts', {})

function fixture(entries = {}, prefix = 'new-token') {
  const values = new Map(Object.entries(entries))
  const store = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
  }
  let nextToken = 0
  const token = load('web/lib/util/device-token.ts', {
    'common/util/random': { randomString: () => `${prefix}-${++nextToken}` },
    'common/browse-rollout': rules,
    'common/util/json': json,
    './local': { safeLocalStorage: store },
  })
  return { store, token }
}

function logout(store) {
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
}

test('analytics creating the token before Browse does not lose new-visitor eligibility', () => {
  const { token } = fixture()
  token.ensureDeviceToken()
  const first = token.getDeviceHistory()
  assert.equal(first.browserId, 'new-token-2')
  assert.ok(first.firstSeenTime > 0)
  token.ensureDeviceToken()
  assert.deepEqual(token.getDeviceHistory(), first)
  assert.equal(
    rules.enrollBrowseVisitor({
      history: first,
      experimentStart: 1,
      now: Date.now(),
    }).cohort,
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
      experimentStart: 1,
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

test('a missing moderation token does not make an existing browser new', () => {
  const { token } = fixture({ [rules.BROWSE_BROWSER_KEY]: 'existing-browser' })
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
      experimentStart: 1,
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
  const enrollment = rules.enrollBrowseVisitor({
    history,
    experimentStart: 1,
    now: Date.now(),
  })
  store.setItem(rules.BROWSE_ENROLLMENT_KEY, JSON.stringify(enrollment))
  store.setItem(rules.BROWSE_CHOICE_KEY, JSON.stringify('legacy'))
  logout(store)
  assert.equal(store.getItem('CACHED_USER_KEY_V2'), null)
  assert.equal(store.getItem('is-native'), 'true')
  assert.equal(store.getItem(rules.BROWSE_CHOICE_KEY), '"legacy"')
  assert.equal(
    store.getItem(rules.BROWSE_ENROLLMENT_KEY),
    JSON.stringify(enrollment)
  )
  assert.equal(store.getItem('device-token'), null)
  assert.equal(token.ensureDeviceToken(), 'new-token-3')
  const after = token.getDeviceHistory()
  assert.equal(after.browserId, history.browserId)
  assert.equal(after.firstSeenTime, history.firstSeenTime)
  assert.deepEqual(Array.from(after.deviceTokens), [
    'new-token-1',
    'new-token-3',
  ])
})

test('treated signup keeps New Browse after logout and same-browser re-login', () => {
  // Use the real deterministic assignment, rather than forcing a test variant.
  let prefix = 'signup-0'
  for (let i = 0; ; i++) {
    prefix = `signup-${i}`
    const enrollment = rules.enrollBrowseVisitor({
      history: { browserId: `${prefix}-2`, firstSeenTime: 10 },
      experimentStart: 1,
      now: 20,
    })
    if (enrollment.variant === 'treatment') break
    assert.ok(i < 100)
  }
  const { store, token } = fixture({}, prefix)
  const history = token.getDeviceHistory()
  const enrollment = rules.enrollBrowseVisitor({
    history,
    experimentStart: 1,
    now: Date.now(),
  })
  store.setItem(rules.BROWSE_ENROLLMENT_KEY, JSON.stringify(enrollment))
  const user = { initialDeviceToken: token.ensureDeviceToken() }
  const seenTokens = new Set([user.initialDeviceToken])
  for (let i = 0; i < 3; i++) {
    logout(store)
    const currentToken = token.ensureDeviceToken()
    assert.ok(!seenTokens.has(currentToken), 'moderation token must rotate')
    seenTokens.add(currentToken)
    const after = token.getDeviceHistory()
    const existingUser = rules.isExistingBrowseUser(after, user, currentToken)
    assert.equal(existingUser, false)
    const restored = rules.readBrowseEnrollment(
      JSON.parse(store.getItem(rules.BROWSE_ENROLLMENT_KEY)),
      after.browserId
    )
    assert.deepEqual(restored, JSON.parse(JSON.stringify(enrollment)))
    assert.equal(
      rules.getBrowseView({
        enrollment: restored,
        existingUser,
        experimentEnabled: true,
      }),
      'new'
    )
    assert.equal(store.getItem(rules.BROWSE_CHOICE_KEY), null)
    assert.equal(
      rules.isExistingBrowseUser(
        after,
        { initialDeviceToken: 'another-browser' },
        currentToken
      ),
      true
    )
    assert.equal(
      rules.isExistingBrowseUser(after, { ...user, isBot: true }, currentToken),
      true
    )
  }
})

test('older histories learn the current token without inventing lost signup history', () => {
  const oldHistory = { browserId: 'existing', firstSeenTime: 100 }
  const { token } = fixture({
    'device-token': 'current',
    [rules.BROWSE_BROWSER_KEY]: oldHistory.browserId,
    [rules.DEVICE_HISTORY_KEY]: JSON.stringify(oldHistory),
  })
  const after = token.getDeviceHistory()
  assert.equal(after.firstSeenTime, oldHistory.firstSeenTime)
  assert.deepEqual(Array.from(after.deviceTokens), ['current'])
  assert.equal(
    rules.isExistingBrowseUser(
      after,
      { initialDeviceToken: 'already-lost' },
      'current'
    ),
    true
  )
  token.ensureDeviceToken()
  assert.deepEqual(token.getDeviceHistory(), after)
})
