// Actual readiness SQL against disposable PostgreSQL. Requires a locally
// cached postgres:15-alpine image; no network, credentials, or mounted data.
// Run after building common: node --test backend/scripts/tests/browse-personalization.test.cjs
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
const rules = require(path.join(root, 'common/lib/browse-personalization'))
const captured = {}
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync(
      path.join(root, 'backend/shared/src/browse-personalization.ts'),
      'utf8'
    ),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } }
  ).outputText,
  {
    exports: captured,
    require: (id) => {
      if (id === 'common/browse-personalization') return rules
      throw new Error(`Unexpected readiness dependency: ${id}`)
    },
  }
)

const container = `browse-readiness-test-${randomUUID()}`
let started = false
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

before(async () => {
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
  started = true
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
  if (started) docker(['stop', container])
})

const schema = `
  drop table if exists user_contract_views, contracts, user_topic_interests;
  create table contracts (id text primary key, visibility text, deleted boolean default false);
  create table user_contract_views (
    user_id text, contract_id text, page_views bigint default 0, card_views bigint default 0,
    unique(user_id, contract_id)
  );
  create table user_topic_interests (user_id text, created_time timestamptz, group_ids_to_activity jsonb);
  insert into contracts (id, visibility)
    select 'market-' || n, 'public' from generate_series(1, 30) n;
`
const profile = (
  user = 'alice',
  value = '{"topic-a":{"conversionScore":0.4}}',
  date = '2026-09-06'
) =>
  pgp.as.format(
    'insert into user_topic_interests values ($1, $2, $3::jsonb);',
    [user, date, value]
  )
const views = (count, user = 'alice') =>
  pgp.as.format(
    `
  insert into user_contract_views (user_id, contract_id, page_views)
    select $1, 'market-' || n, 1 from generate_series(1, $2) n;
`,
    [user, count]
  )
const result = (setup, user = 'alice') => {
  const sql = pgp.as.format(captured.BROWSE_PERSONALIZATION_SQL, [
    user,
    rules.FOR_YOU_MIN_MARKET_VIEWS,
  ])
  const [count, learned] = query(schema + setup + sql)
    .trim()
    .split('|')
  return {
    count: Number(count),
    eligible: rules.hasEnoughBrowseHistory(Number(count), learned === 't'),
  }
}

test('20 different public markets plus a learned profile qualifies; 19 does not', () => {
  assert.equal(result(views(19) + profile()).eligible, false)
  assert.deepEqual(result(views(20) + profile()), { count: 20, eligible: true })
})

test('repeat page views and passive card impressions cannot inflate the threshold', () => {
  assert.equal(
    result(
      profile() +
        `
    insert into user_contract_views values ('alice', 'market-1', 10000, 0);
    insert into user_contract_views select 'alice', 'market-' || n, 0, 10000
      from generate_series(2, 30) n;
  `
    ).eligible,
    false
  )
})

test('private, unlisted, and deleted markets do not qualify', () => {
  assert.equal(
    result(
      views(22) +
        profile() +
        `
    update contracts set visibility = 'private' where id = 'market-20';
    update contracts set visibility = 'unlisted' where id = 'market-21';
    update contracts set deleted = true where id = 'market-22';
  `
    ).eligible,
    false
  )
})

test('visits alone do not qualify before learned data has been calculated', () => {
  assert.equal(result(views(30)).eligible, false)
})

test('another account cannot provide the visits or learned profile', () => {
  assert.equal(result(views(30, 'bob') + profile('bob')).eligible, false)
  assert.equal(result(views(30) + profile('bob')).eligible, false)
})

test('uses the latest learned profile and requires a valid positive score', () => {
  assert.equal(
    result(views(20) + profile() + profile('alice', '{}', '2026-09-07'))
      .eligible,
    false
  )
  assert.equal(
    result(
      views(20) +
        profile(
          'alice',
          '{"a":{"conversionScore":"NaN"},"b":{"conversionScore":0},"c":{"conversionScore":2}}'
        )
    ).eligible,
    false
  )
})

test('stops counting at the threshold for established users', () => {
  assert.deepEqual(result(views(30) + profile()), { count: 20, eligible: true })
})

test('database work receives a transaction-local server timeout and only the authenticated ID', async () => {
  const calls = []
  const pg = {
    tx: async (fn) =>
      fn({
        none: async (sql) => calls.push(sql),
        one: async (sql, args) => {
          calls.push({ sql, args })
          return { distinct_market_views: 20, has_learned_interests: true }
        },
      }),
  }
  assert.equal(
    await captured.getBrowsePersonalizationEligibility(pg, 'alice'),
    true
  )
  assert.equal(calls[0], 'set local statement_timeout = 1000')
  assert.equal(calls[1].sql, captured.BROWSE_PERSONALIZATION_SQL)
  assert.deepEqual(Array.from(calls[1].args), ['alice', 20])
})
