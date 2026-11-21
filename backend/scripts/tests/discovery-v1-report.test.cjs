// Synthetic PostgreSQL integration tests. Requires `yarn build:ci`, Docker,
// and a locally cached postgres:15-alpine image. No credentials or network.
// Run: node --test backend/scripts/tests/discovery-v1-report.test.cjs
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { randomUUID } = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { after, before, test } = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')
const pgp = require('pg-promise')()

const root = path.resolve(__dirname, '../../..')
const events = require(path.join(root, 'common/lib/discovery-experiment'))
const { AB_TEST_ACCOUNT_OVERRIDES } = require(path.join(
  root,
  'common/lib/ab-test'
))
const container = `discovery-report-test-${randomUUID()}`
const docker = (args, input) =>
  execFileSync('docker', args, {
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  })
const query = (sql) =>
  docker(
    [
      'exec',
      '-i',
      container,
      'psql',
      '-U',
      'postgres',
      '-X',
      '-qAt',
      '-v',
      'ON_ERROR_STOP=1',
    ],
    sql
  )
const source = fs.readFileSync(
  path.join(root, 'backend/scripts/discovery-v1-report.ts'),
  'utf8'
)
const functions = fs.readFileSync(
  path.join(root, 'backend/supabase/functions.sql'),
  'utf8'
)
const boundary = functions.match(
  /create\s+or replace function public\.date_to_midnight_pt[^]*?\$function\$;/
)[0]
const captured = []

before(async () => {
  // Capture the actual report statements while replacing every production
  // dependency. Unknown imports fail closed; run-script is never imported.
  let completion
  const database = {
    tx: async (_, callback) => callback(database),
    none: async () => {},
    one: async (sql, params) => {
      captured.push({ sql, params })
      return { report_end_is_mature: true }
    },
    map: async (sql, params) => {
      captured.push({ sql, params })
      return []
    },
    manyOrNone: async (sql, params) => {
      captured.push({ sql, params })
      return []
    },
  }
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    {
      exports: {},
      process: { argv: ['node', 'report', '2026-09-01', '2026-09-02'] },
      Date,
      console: { log() {}, table() {} },
      require: (id) => {
        if (id === './run-script')
          return {
            runScript: (callback) => {
              completion = callback({ pg: database })
            },
          }
        if (id === 'common/ab-test') return { AB_TEST_ACCOUNT_OVERRIDES }
        if (id === 'common/discovery-experiment') return events
        if (id === 'common/envs/constants')
          return { ENV_CONFIG: { adminIds: ['admin'] } }
        if (id === 'shared/supabase/init')
          return { READ_ONLY_REPEATABLE_MODE: {} }
        throw new Error(`Unexpected report import: ${id}`)
      },
    }
  )
  await completion
  docker([
    'run',
    '--detach',
    '--rm',
    '--pull=never',
    '--name',
    container,
    '--network',
    'none',
    '--env',
    'POSTGRES_HOST_AUTH_METHOD=trust',
    'postgres:15-alpine',
  ])
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      query('select 1')
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  throw new Error('Synthetic PostgreSQL did not become ready')
})
after(() => {
  docker(['stop', container])
})

const literal = (value) => pgp.as.format('$1', [value])
const at = (minutes) =>
  new Date(Date.parse('2026-09-01T12:00:00Z') + minutes * 60_000).toISOString()
const subjects = [
  'control-one',
  'control-two',
  'treatment-one',
  'treatment-two',
]
const schema = `
  ${boundary}
  create temp table users (id text primary key, username text, is_bot boolean);
  create temp table user_events (ts timestamptz, user_id text, name text, data jsonb);
  create temp table user_contract_interactions (id text, user_id text, contract_id text, name text, created_time timestamptz);
  create temp table user_view_events (user_id text, contract_id text, name text, created_time timestamptz);
  insert into users values ${subjects
    .map((id) => `(${literal(id)},${literal(id)},false)`)
    .join(',')};
`
const event = (user, name, minute, data) => `insert into user_events values (
  ${literal(at(minute))},${literal(user)},${literal(name)},${literal(
  JSON.stringify({
    variant: user.startsWith('control') ? 'control' : 'treatment',
    assignmentSource: 'user-hash',
    sourceComponent: 'search',
    surface: 'for-you',
    resultSetId: `${user}-results`,
    ...data,
  })
)}::jsonb);`
const request = (user, data = {}, minute = 0) =>
  event(user, events.DISCOVERY_SEARCH_REQUEST_EVENT, minute, {
    requestAttemptId: `${user}-request`,
    isFresh: true,
    ...data,
  })
const exposure = (user, suffix = 'first', minute = 0.02, data = {}) =>
  event(user, events.DISCOVERY_EXPOSURE_EVENT, minute, {
    presentationId: `${user}-${suffix}`,
    marketCount: 1,
    items: [{ id: 'market', itemType: 'market', rank: 1 }],
    ...data,
  })
const action = (
  user,
  minute = 3
) => `insert into user_contract_interactions values (
  ${literal(user + '-' + minute)},${literal(
  user
)},'market','page bet',${literal(at(minute))});`
const run = (needle, seed = '') => {
  const statement = captured.find(({ sql }) => sql.includes(needle))
  assert.ok(statement, `Captured report statement: ${needle}`)
  return JSON.parse(
    query(`begin; ${schema} ${seed}
    select coalesce(json_agg(result), '[]') from (
      ${pgp.as.format(statement.sql, statement.params)}
    ) result; rollback;`)
  )
}
const rate = (rows, metric) => rows.find((row) => row.metric === metric)

test('cached Browse clicks and actions remain in the originating request', () => {
  const seed = subjects
    .map(
      (user) =>
        request(user) +
        exposure(user) +
        exposure(user, 'cached', 2) +
        action(user) +
        event(user, events.DISCOVERY_RESULT_CLICK_EVENT, 2.1, {
          presentationId: `${user}-cached`,
          itemType: 'market',
        })
    )
    .join('')
  const rows = run('request_subject_metrics', seed)
  for (const metric of ['market CTR', 'meaningful action rate']) {
    assert.equal(Number(rate(rows, metric).control_rate), 1)
    assert.equal(Number(rate(rows, metric).treatment_rate), 1)
    assert.equal(rate(rows, metric).control_subjects, 2)
  }
})

test('cached revisits do not restart the request attribution window', () => {
  const seed = subjects
    .map(
      (user) =>
        request(user) +
        exposure(user) +
        exposure(user, 'cached', 29) +
        action(user, 31) +
        event(user, events.DISCOVERY_RESULT_CLICK_EVENT, 31, {
          presentationId: `${user}-cached`,
          itemType: 'market',
        })
    )
    .join('')
  const rows = run('request_subject_metrics', seed)
  assert.equal(Number(rate(rows, 'meaningful action rate').treatment_rate), 0)
  assert.equal(Number(rate(rows, 'market CTR').control_rate), 0)
})

test('an action after a new result set is credited to only the latest request', () => {
  const seed = subjects
    .map(
      (user) =>
        request(user) +
        exposure(user) +
        request(
          user,
          {
            requestAttemptId: `${user}-new-request`,
            resultSetId: `${user}-new-results`,
          },
          2
        ) +
        exposure(user, 'new', 2.02, { resultSetId: `${user}-new-results` }) +
        action(user)
    )
    .join('')
  const primary = rate(
    run('request_subject_metrics', seed),
    'meaningful action rate'
  )
  assert.equal(Number(primary.control_rate), 0.5)
  assert.equal(Number(primary.treatment_rate), 0.5)
})

test('missing and late presentations stay in the ITT denominator as zero', () => {
  const seed = subjects
    .map(
      (user) =>
        request(user) +
        (user.endsWith('one') ? '' : exposure(user, 'late', 2) + action(user))
    )
    .join('')
  const rows = run('request_subject_metrics', seed)
  assert.equal(Number(rate(rows, 'render rate').control_rate), 0)
  assert.equal(Number(rate(rows, 'meaningful action rate').treatment_rate), 0)
  assert.equal(rate(rows, 'render rate').control_subjects, 2)
})

test('duplicate request and exposure deliveries do not change denominators', () => {
  const seed = subjects
    .map(
      (user) =>
        request(user).repeat(2) +
        exposure(user).repeat(2) +
        action(user) +
        request(
          user,
          {
            requestAttemptId: `${user}-missing-request`,
            resultSetId: `${user}-missing-results`,
          },
          40
        )
    )
    .join('')
  const score = run('count(*)::int as presentations', seed)
  assert.equal(score.find((row) => row.variant === 'control').presentations, 2)
  assert.equal(
    Number(
      rate(run('request_subject_metrics', seed), 'meaningful action rate')
        .control_rate
    ),
    0.5
  )
})

test('user weighting prevents frequent requesters from dominating the mean', () => {
  const seed = subjects
    .map((user) => {
      const active = user.endsWith('one')
      return Array.from({ length: active ? 9 : 1 }, (_, index) => {
        const resultSetId = `${user}-${index}`
        return (
          request(
            user,
            { requestAttemptId: resultSetId, resultSetId },
            index * 40
          ) +
          exposure(user, String(index), index * 40 + 0.02, { resultSetId }) +
          (active ? action(user, index * 40 + 3) : '')
        )
      }).join('')
    })
    .join('')
  const primary = rate(
    run('request_subject_metrics', seed),
    'meaningful action rate'
  )
  assert.equal(Number(primary.control_rate), 0.5)
  assert.equal(Number(primary.treatment_rate), 0.5)
})

test('forced QA accounts are excluded and 50/50 SRM uses unique subjects', () => {
  const forced = Object.keys(AB_TEST_ACCOUNT_OVERRIDES)
  const seed =
    `insert into users values ${forced
      .map((user) => `(${literal(user)},${literal(user)},false)`)
      .join(',')};` +
    subjects.map((user) => request(user).repeat(3)).join('') +
    forced
      .map(
        (user) =>
          request(user, { assignmentSource: 'forced' }) +
          exposure(user, 'first', 0.02, { assignmentSource: 'forced' })
      )
      .join('')
  const srm = run('assignment_requests as', seed)[0]
  assert.equal(srm.control_subjects, 2)
  assert.equal(srm.treatment_subjects, 2)
  assert.equal(srm.passes_5_percent_srm_check, true)
  assert.equal(run('count(*)::int as presentations', seed).length, 0)
})

test('report maturity uses the production Pacific function across both DST changes', () => {
  const statement = captured.find(({ sql }) =>
    sql.includes('report_end_is_mature')
  )
  for (const [date, midnight] of [
    ['2026-03-08', '2026-03-08T08:00:00Z'],
    ['2026-03-09', '2026-03-09T07:00:00Z'],
    ['2026-11-01', '2026-11-01T07:00:00Z'],
    ['2026-11-02', '2026-11-02T08:00:00Z'],
  ]) {
    for (const delta of [30 * 60_000 - 1, 30 * 60_000]) {
      const result = query(`begin; ${boundary}
        ${pgp.as.format(statement.sql, [
          date,
          new Date(Date.parse(midnight) + delta).toISOString(),
        ])}; rollback;`).trim()
      assert.equal(
        result,
        delta === 30 * 60_000 ? 't' : 'f',
        `${date} at ${delta}ms`
      )
    }
  }
})

test('semantic SQL timeout cancels slow work and does not persist on the connection', async () => {
  const { withSemanticQueryTimeout } = require(path.join(
    root,
    'backend/shared/lib/helpers/semantic-search-fallback'
  ))
  const statements = []
  await withSemanticQueryTimeout(
    {
      tx: (callback) => callback({ none: async (sql) => statements.push(sql) }),
    },
    async () => {}
  )
  const started = Date.now()
  assert.throws(
    () => query(`begin; ${statements.join(';')}; select pg_sleep(5); commit;`),
    /statement timeout/
  )
  assert.ok(Date.now() - started < 4000)
  assert.equal(
    query(
      `begin; ${statements.join(';')}; commit; show statement_timeout;`
    ).trim(),
    '0'
  )
})
