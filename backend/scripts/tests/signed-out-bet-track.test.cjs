// The real track(), over a stand-in database: what it stores and what it
// tells its caller. The other suites stub track(), so this is where its
// answer is checked.
// node --test backend/scripts/tests/signed-out-bet-track.test.cjs
const assert = require('node:assert/strict')
const { test } = require('node:test')
const lodash = require('lodash')
const { load } = require('./load-ts.cjs')
const random = load('common/src/util/random.ts', {})
const rules = load('common/src/signed-out-bet.ts', {
  './ab-test': load('common/src/ab-test.ts', { './util/random': random }),
})

// `insert` stands in for the Supabase call; `api` for the API client.
function analytics({ insert, api, user = null, pathname = '/browse' }) {
  const inserts = []
  const calls = []
  const { track } = load(
    'web/lib/service/analytics.ts',
    {
      'common/envs/constants': { ENV: 'PROD' },
      'common/util/object': load('common/src/util/object.ts', { lodash }),
      'common/stat-surfaces': load('common/src/stat-surfaces.ts', { lodash }),
      // The same few lines as common/src/supabase/utils.ts.
      'common/supabase/utils': {
        run: async (query) => {
          const { data, count, error } = await query
          if (error != null) throw error
          return { data, count }
        },
      },
      '../native/is-native': { getIsNative: () => false },
      'web/lib/api/api': {
        api: (...args) => {
          calls.push(args)
          return api(...args)
        },
        completeQuest: async () => {},
      },
      'web/lib/firebase/users': {
        auth: { currentUser: user ? { uid: user } : null },
      },
      'web/lib/supabase/db': {
        db: {
          from: (table) => ({
            insert: (row) => {
              inserts.push({ table, row })
              return insert(row)
            },
          }),
        },
      },
      'web/lib/util/device-token': { ensureDeviceToken: () => 'device-1' },
    },
    { window: { location: { pathname } }, console: { log() {} } }
  )
  return { track, inserts, calls }
}

const exposure = () => ({
  variant: 'treatment',
  forced: false,
  location: 'bet panel',
  surface: 'ticket',
  contractId: 'c1',
  environment: 'production',
  assignmentUnit: 'device',
  firstSurface: 'ticket',
  sinceFirstPressMs: 0,
  code: undefined,
})

test('track stores the event and says so', async () => {
  const { track, inserts } = analytics({
    insert: async () => ({ data: null, error: null }),
  })
  assert.equal(await track(rules.SIGNED_OUT_BET_TEST, exposure()), true)
  assert.equal(inserts.length, 1)
  assert.equal(inserts[0].table, 'user_events')
  // The market goes in its own column, the device is added, and undefined
  // values are left out.
  assert.deepEqual(JSON.parse(JSON.stringify(inserts[0].row)), {
    name: rules.SIGNED_OUT_BET_TEST,
    contract_id: 'c1',
    data: {
      variant: 'treatment',
      forced: false,
      location: 'bet panel',
      surface: 'ticket',
      environment: 'production',
      assignmentUnit: 'device',
      firstSurface: 'ticket',
      sinceFirstPressMs: 0,
      isNative: false,
      deviceId: 'device-1',
    },
  })
})

test('track says when the event was not stored, and does not throw', async () => {
  // The database refuses it.
  const refused = analytics({
    insert: async () => ({ data: null, error: { message: 'denied' } }),
  })
  assert.equal(
    await refused.track(rules.SIGNED_OUT_BET_TEST, exposure()),
    false
  )
  // The request never arrives.
  const offline = analytics({
    insert: async () => {
      throw new TypeError('Failed to fetch')
    },
  })
  assert.equal(
    await offline.track(rules.SIGNED_OUT_BET_TEST, exposure()),
    false
  )
  assert.equal(offline.inserts.length, 1)
})

test('events that go through the API answer the same way', async () => {
  const stored = analytics({
    insert: async () => ({ data: null, error: null }),
    api: async () => ({}),
  })
  assert.equal(await stored.track('view market', { contractId: 'c1' }), true)
  assert.deepEqual(JSON.parse(JSON.stringify(stored.calls)), [
    ['record-contract-view', { contractId: 'c1', kind: 'page' }],
  ])
  assert.equal(stored.inserts.length, 0)

  const failed = analytics({
    insert: async () => ({ data: null, error: null }),
    api: async () => {
      throw new Error('503')
    },
  })
  assert.equal(await failed.track('view market', { contractId: 'c1' }), false)
})
