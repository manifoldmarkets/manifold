// Opt-in integration regressions; never uses application credentials or a remote DB.
// Run only against a disposable localhost PostgreSQL database named pr4184_test:
//   node backend/api/tests/claim-manalink-postgres.cjs
// Optional MANALINK_TEST_PORT (default 55484), MANALINK_SOURCE_ROOT, and
// MANALINK_BASELINE_CLAIM (saved old handler source) support before/after checks.
// --pool-baseline expects the old handler's connection-acquire failure;
// --expect-cycle expects the old mixed queue/row-lock failure. Neither is a pass
// for the candidate. Pool/lock/broadcast behavior needs this real-PostgreSQL run.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const repositoryRoot = path.resolve(__dirname, '../../..')
const rootRequire = createRequire(path.join(repositoryRoot, 'package.json'))
const ts = rootRequire('typescript')
const pgp = rootRequire('pg-promise')()
const sourceRoot = process.env.MANALINK_SOURCE_ROOT || repositoryRoot
const port = Number(process.env.MANALINK_TEST_PORT || 55484)
assert(Number.isInteger(port) && port > 0 && port < 65536)
const connection = {
  host: '127.0.0.1',
  port,
  user: 'postgres',
  database: 'pr4184_test',
}
const db = pgp({ ...connection, max: 10 })
const expectCycle = process.argv.includes('--expect-cycle')
const poolBaseline = process.argv.includes('--pool-baseline')
class APIError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}
const log = Object.assign(() => {}, { warn: () => {}, error: () => {} })
const millis = { tsToMillis: (value) => new Date(value).getTime() }
function load(relative, dependencies) {
  const filename = path.join(sourceRoot, relative)
  const source = fs.readFileSync(
    relative === 'backend/api/src/claim-manalink.ts' &&
      process.env.MANALINK_BASELINE_CLAIM
      ? process.env.MANALINK_BASELINE_CLAIM
      : filename,
    'utf8'
  )
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText
  const module = { exports: {} }
  const restrictedRequire = (name) => {
    if (Object.hasOwn(dependencies, name)) return dependencies[name]
    if (name === 'lodash' || name === 'zod') return rootRequire(name)
    throw new Error(`Unmocked dependency ${name} from ${relative}`)
  }
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, {
    filename,
  })(restrictedRequire, module, module.exports)
  return module.exports
}
const txnConvert = load('common/src/supabase/txns.ts', { './utils': millis })
const array = load('common/src/util/array.ts', {})
const object = load('common/src/util/object.ts', {})
const endpoint = {
  APIError,
  authEndpoint: (fn) => fn,
  validate: (schema, value) => schema.parse(value),
}
const deferred = () => {
  let resolve
  const promise = new Promise((r) => {
    resolve = r
  })
  return { promise, resolve }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function until(check, description) {
  const end = Date.now() + 1500
  while (Date.now() < end) {
    if (await check()) return
    await sleep(10)
  }
  throw new Error(`Timed out awaiting ${description}`)
}
function client(label, pool = db, onAttempt = () => {}) {
  return {
    tx: (options, callback) =>
      pool.tx(typeof options === 'function' ? {} : options, async (tx) => {
        onAttempt()
        callback = typeof options === 'function' ? options : callback
        await tx.none(
          "set local statement_timeout = '2500ms'; set local idle_in_transaction_session_timeout = '8000ms'"
        )
        await tx.one("select set_config('application_name', $1, true)", [label])
        return callback(tx)
      }),
  }
}
async function user(id, tx = db) {
  return tx.oneOrNone(
    'select id, username, balance, cash_balance as "cashBalance" from users where id = $1',
    [id]
  )
}
function handlers({
  pauseConversion = false,
  pool = db,
  beforeUser,
  beforeTransfer,
  afterTransfer,
} = {}) {
  const broadcasts = []
  let attempts = 0
  const claimClient = client('pr4184-claim', pool, () => attempts++)
  const getUser = async (id, tx) => {
    if (beforeUser) await beforeUser(id, tx)
    return user(id, tx || pool)
  }
  const retry = load('backend/shared/src/transact-with-retries.ts', {
    './supabase/init': {
      createSupabaseDirectClient: () => claimClient,
      SERIAL_MODE: {},
    },
    'shared/monitoring/log': { log },
  })
  const queueModule = load('backend/shared/src/helpers/fn-queue.ts', {
    'common/api/utils': { APIError },
    'shared/utils': { log },
  })
  const firstDone = deferred()
  const continueConversion = deferred()
  let secondRequested = false
  const runner = load('backend/shared/src/txn/run-txn.ts', {
    'common/envs/constants': { isAdminId: () => false },
    'shared/supabase/utils': {
      getInsertQuery: (table, values) =>
        pgp.helpers.insert(
          values,
          new pgp.helpers.ColumnSet(Object.keys(values), { table })
        ) + ' returning *',
    },
    'common/api/utils': { APIError },
    'shared/supabase/init': { pgp },
    'common/supabase/txns': txnConvert,
    'common/util/object': object,
    'shared/supabase/users': {
      broadcastUserUpdates: (rows) => broadcasts.push(structuredClone(rows)),
    },
    'shared/helpers/fn-queue': queueModule,
    'common/util/array': array,
  })
  const txns = {
    ...runner,
    runTxnOutsideBetQueue: async (tx, data, ...rest) => {
      if (beforeTransfer) await beforeTransfer(tx, data)
      const result = await runner.runTxnOutsideBetQueue(tx, data, ...rest)
      if (afterTransfer) await afterTransfer(tx, data)
      return result
    },
    runTxnInBetQueue: async (tx, data, ...rest) => {
      if (pauseConversion && data.category === 'CONVERT_CASH_DONE') {
        firstDone.resolve()
        await continueConversion.promise
        secondRequested = true
      }
      return runner.runTxnInBetQueue(tx, data, ...rest)
    },
  }
  const claimModule = load('backend/api/src/claim-manalink.ts', {
    'common/can-send-mana': { canSendMana: () => ({ canSend: true }) },
    './helpers/endpoint': endpoint,
    './helpers/rate-limit': { getActiveUserBans: async () => [] },
    'shared/txn/run-txn': txns,
    'shared/supabase/init': { createSupabaseDirectClient: () => claimClient },
    'shared/transact-with-retries': retry,
    'common/supabase/utils': millis,
    'shared/utils': { getUser },
    'shared/supabase/users': {
      broadcastUserUpdates: (rows) => broadcasts.push(structuredClone(rows)),
    },
  })
  const conversionModule = load('backend/api/src/convert-cash-to-mana.ts', {
    './helpers/endpoint': endpoint,
    'shared/txn/run-txn': txns,
    'shared/supabase/init': {
      createSupabaseDirectClient: () => client('pr4184-convert'),
    },
    'common/envs/constants': { CASH_TO_MANA_CONVERSION_RATE: 100 },
    'shared/utils': { getUser: user },
  })
  return {
    claim: (id, slug = 'synthetic-link') =>
      claimModule.claimmanalink({ body: { slug } }, { uid: id }),
    convert: (id) =>
      conversionModule.convertCashToMana({ amount: 1 }, { uid: id }),
    firstDone,
    continueConversion,
    secondRequested: () => secondRequested,
    broadcasts,
    attempts: () => attempts,
    debit: (id, amount) =>
      client('pr4184-debit', pool).tx((tx) =>
        runner.runTxnInBetQueue(tx, {
          fromId: id,
          fromType: 'USER',
          toId: 'BANK',
          toType: 'BANK',
          amount,
          token: 'M$',
          category: 'MANAGRAM',
          description: 'Synthetic concurrent debit',
        })
      ),
  }
}
async function reset(maxUses = 3, creatorBalance = 1000) {
  await db.none(
    'truncate manalink_claims, txns, manalinks, users restart identity cascade'
  )
  await db.none(
    "insert into users (id, username, balance, cash_balance) values ('creator', 'creator', $1, 10), ('claimant', 'claimant', 0, 10), ('other', 'other', 0, 10)",
    [creatorBalance]
  )
  await db.none(
    "insert into manalinks (id, creator_id, amount, max_uses) values ('synthetic-link', 'creator', 50, $1)",
    [maxUses]
  )
}
const settled = (promise) =>
  promise.then(
    (value) => ({ ok: true, value }),
    (error) => ({
      ok: false,
      status: error.status,
      code: error.code,
      message: error.message,
    })
  )
async function repro(convertingId) {
  await reset()
  const h = handlers({ pauseConversion: true })
  const conversion = settled(h.convert(convertingId))
  await h.firstDone.promise
  const claim = settled(h.claim('claimant'))
  await until(
    async () =>
      (
        await db.one(
          "select count(*)::int as n from pg_stat_activity where application_name='pr4184-claim' and wait_event_type='Lock'"
        )
      ).n === 1,
    'first claim blocked on converter user row'
  )
  const anotherClaim = settled(h.claim('other'))
  await until(
    async () =>
      (
        await db.one(
          "select count(*)::int as n from pg_stat_activity where application_name='pr4184-claim' and wait_event_type='Lock'"
        )
      ).n === 2,
    'second claim blocked on same manalink'
  )
  h.continueConversion.resolve()
  await until(() => h.secondRequested(), 'conversion second transfer enqueued')
  if (!expectCycle) {
    const outcomes = await Promise.all([claim, conversion, anotherClaim])
    assert(
      outcomes.every((result) => result.ok),
      JSON.stringify(outcomes)
    )
    const rows = await db.any('select * from users order by id')
    for (const row of rows) {
      const manaDelta =
        (row.id === 'creator' ? -100 : 50) + (row.id === convertingId ? 100 : 0)
      assert.equal(row.balance, (row.id === 'creator' ? 1000 : 0) + manaDelta)
      assert.equal(row.total_deposits, manaDelta)
      assert.equal(row.cash_balance, row.id === convertingId ? 9 : 10)
      assert.equal(row.total_cash_deposits, row.id === convertingId ? -1 : 0)
    }
    assert.deepEqual(await counts(), { txns: 4, claims: 2 })
    console.log(
      JSON.stringify({
        test: `conversion-completes-${convertingId}`,
        result: 'PASS',
        outcomes,
        rows,
      })
    )
    return
  }
  await sleep(30)
  const waits = await db.any(
    "select application_name, state, wait_event_type, wait_event, pg_blocking_pids(pid) as blockers, left(query, 120) as query from pg_stat_activity where application_name like 'pr4184-%' order by application_name, pid"
  )
  assert.equal(
    waits.filter(
      (row) =>
        row.application_name === 'pr4184-claim' &&
        row.wait_event_type === 'Lock'
    ).length,
    2
  )
  assert.equal(
    waits.find((row) => row.application_name === 'pr4184-convert').state,
    'idle in transaction'
  )
  const outcomes = await Promise.all([claim, conversion, anotherClaim])
  assert.equal(outcomes[0].ok, false)
  assert.equal(outcomes[0].code, '57014')
  assert.equal(outcomes[1].ok, true)
  const claims = await db.any(
    'select t.to_id from manalink_claims mc join txns t on t.id = mc.txn_id'
  )
  assert(
    !claims.some((row) => row.to_id === 'claimant'),
    'timed-out claim must roll back'
  )
  console.log(
    JSON.stringify({
      test: `queue-row-lock-cycle-${convertingId}`,
      result: 'REPRODUCED',
      waits,
      outcomes,
      claims,
    })
  )
}
async function baseline() {
  await reset()
  let h = handlers()
  let results = await Promise.all([
    settled(h.claim('claimant')),
    settled(h.claim('claimant')),
  ])
  assert.equal(results.filter((r) => r.ok).length, 1)
  assert.match(results.find((r) => !r.ok).message, /already redeemed/)
  assert.equal(
    (await db.one('select count(*)::int as n from manalink_claims')).n,
    1
  )
  console.log(
    JSON.stringify({ test: 'same-user-replay', result: 'PASS', results })
  )
  await reset(1)
  h = handlers()
  results = await Promise.all([
    settled(h.claim('claimant')),
    settled(h.claim('other')),
  ])
  assert.equal(results.filter((r) => r.ok).length, 1)
  assert.match(results.find((r) => !r.ok).message, /max uses/)
  console.log(
    JSON.stringify({ test: 'last-slot-two-users', result: 'PASS', results })
  )
  await reset(3, 10)
  h = handlers()
  const failure = await settled(h.claim('claimant'))
  assert.equal(failure.ok, false)
  assert.equal(failure.status, 403)
  const counts = await db.one(
    'select (select count(*)::int from txns) as txns, (select count(*)::int from manalink_claims) as claims'
  )
  assert.deepEqual(counts, { txns: 0, claims: 0 })
  const balances = await db.any('select id, balance from users order by id')
  assert.equal(balances.find((u) => u.id === 'creator').balance, 10)
  assert.equal(balances.find((u) => u.id === 'claimant').balance, 0)
  console.log(
    JSON.stringify({
      test: 'insufficient-balance-atomic-rollback',
      result: 'PASS',
      counts,
      balances,
    })
  )
}

async function counts() {
  return db.one(
    'select (select count(*)::int from txns) as txns, (select count(*)::int from manalink_claims) as claims'
  )
}
async function poolContention() {
  await reset()
  const pool = pgp({ ...connection, max: 2, connectionTimeoutMillis: 500 })
  const firstRead = deferred()
  const releaseRead = deferred()
  let paused = false
  const h = handlers({
    pool,
    beforeUser: async () => {
      if (!paused) {
        paused = true
        firstRead.resolve()
        await releaseRead.promise
      }
    },
  })
  try {
    const first = settled(h.claim('claimant'))
    await firstRead.promise
    const second = settled(h.claim('other'))
    await until(
      async () =>
        (
          await db.one(
            "select count(*)::int as n from pg_stat_activity where application_name='pr4184-claim' and wait_event_type='Lock'"
          )
        ).n === 1,
      'second pooled claim waiting on link'
    )
    releaseRead.resolve()
    const outcomes = await Promise.all([first, second])
    if (poolBaseline) {
      assert.equal(outcomes[0].ok, false)
      assert.match(outcomes[0].message, /timeout|connect/i)
      assert.deepEqual(await counts(), { txns: 1, claims: 1 })
    } else {
      assert(
        outcomes.every((result) => result.ok),
        JSON.stringify(outcomes)
      )
      assert.deepEqual(await counts(), { txns: 2, claims: 2 })
      assert.equal((await user('creator')).balance, 900)
    }
    console.log(
      JSON.stringify({
        test: 'two-connection-pool-contention',
        result: poolBaseline ? 'REPRODUCED' : 'PASS',
        outcomes,
      })
    )
  } finally {
    releaseRead.resolve()
    await pool.$pool.end()
  }
}
async function reciprocalClaims() {
  await reset()
  await db.none("update users set balance = 1000 where id = 'claimant'")
  await db.none(
    "insert into manalinks (id, creator_id, amount, max_uses) values ('reverse-link', 'claimant', 50, 1)"
  )
  const bothLocked = deferred()
  let locked = 0
  const participant = () => {
    let first = true
    return handlers({
      beforeTransfer: async (tx, data) => {
        if (!first) return
        first = false
        // Pause at the sender lock that the first UPDATE would take. Both
        // transactions then really deadlock on each other's recipient in Postgres.
        await tx.one('select id from users where id = $1 for update', [
          data.fromId,
        ])
        if (++locked === 2) bothLocked.resolve()
        await bothLocked.promise
      },
    })
  }
  const a = participant()
  const b = participant()
  const outcomes = await Promise.all([
    settled(a.claim('claimant')),
    settled(b.claim('creator', 'reverse-link')),
  ])
  assert(
    outcomes.every((result) => result.ok),
    JSON.stringify(outcomes)
  )
  assert.equal(a.attempts() + b.attempts(), 3)
  assert.deepEqual(await counts(), { txns: 2, claims: 2 })
  for (const id of ['creator', 'claimant']) {
    const row = await db.one('select * from users where id = $1', [id])
    assert.equal(row.balance, 1000)
    assert.equal(row.total_deposits, 0)
  }
  assert.equal(a.broadcasts.length + b.broadcasts.length, 2)
  console.log(
    JSON.stringify({
      test: 'reciprocal-claims-deadlock-retry',
      result: 'PASS',
      attempts: [a.attempts(), b.attempts()],
    })
  )
}
async function concurrentDebit() {
  await reset(3, 75)
  const h = handlers()
  const outcomes = await Promise.all([
    settled(h.claim('claimant')),
    settled(h.debit('creator', 50)),
  ])
  assert.equal(outcomes.filter((result) => result.ok).length, 1)
  assert.equal(outcomes.find((result) => !result.ok).status, 403)
  assert.equal((await user('creator')).balance, 25)
  assert.equal((await counts()).txns, 1)
  console.log(
    JSON.stringify({
      test: 'concurrent-queued-debit-no-overdraft',
      result: 'PASS',
      outcomes,
    })
  )
}
async function insertionFailure() {
  await reset()
  const h = handlers()
  await db.none(`
    create or replace function reject_test_claim() returns trigger language plpgsql as $reject_claim$
    begin
      raise exception 'synthetic claim failure' using errcode = '23514';
    end;
    $reject_claim$;
    create trigger reject_test_claim before insert on manalink_claims
    for each row execute function reject_test_claim();
  `)
  try {
    const result = await settled(h.claim('claimant'))
    assert.equal(result.ok, false)
    assert.equal(result.code, '23514')
    assert.equal(h.attempts(), 1)
    assert.deepEqual(await counts(), { txns: 0, claims: 0 })
    assert.equal((await user('creator')).balance, 1000)
    assert.equal((await user('claimant')).balance, 0)
    assert.equal(h.broadcasts.length, 0)
    console.log(
      JSON.stringify({
        test: 'claim-insert-rollback',
        result: 'PASS; ROLLBACK HAS NO BROADCAST',
        broadcasts: h.broadcasts.length,
      })
    )
  } finally {
    await db.none(
      'drop trigger reject_test_claim on manalink_claims; drop function reject_test_claim()'
    )
  }
}

async function postTransferRetry() {
  for (const exhaust of [false, true]) {
    await reset()
    let transfers = 0
    const h = handlers({
      afterTransfer: () => {
        if (++transfers === 1 || exhaust) {
          throw Object.assign(new Error('injected after transfer'), {
            code: '40P01',
          })
        }
      },
    })
    if (exhaust) {
      await assert.rejects(h.claim('claimant'), { code: '40P01' })
      assert.equal(h.attempts(), 3)
      assert.deepEqual(await counts(), { txns: 0, claims: 0 })
      assert.equal((await user('creator')).balance, 1000)
      assert.equal((await user('claimant')).balance, 0)
      assert.equal(h.broadcasts.length, 0)
    } else {
      await h.claim('claimant')
      assert.equal(h.attempts(), 2)
      assert.deepEqual(await counts(), { txns: 1, claims: 1 })
      assert.equal((await user('creator')).balance, 950)
      assert.equal((await user('claimant')).balance, 50)
      assert.equal(h.broadcasts.length, 1)
    }
    console.log(
      JSON.stringify({ test: 'post-transfer-retry', exhaust, result: 'PASS' })
    )
  }
}

async function main() {
  await db.none(`
    create table if not exists users (id text primary key, username text, balance double precision not null default 0, cash_balance double precision not null default 0, total_deposits double precision not null default 0, total_cash_deposits double precision not null default 0);
    create table if not exists manalinks (id text primary key, creator_id text not null, amount double precision not null, expires_time timestamptz, max_uses int);
    create table if not exists txns (id bigint generated always as identity primary key, created_time timestamptz not null default now(), data jsonb not null, amount double precision not null, token text not null, from_id text not null, to_id text not null, from_type text not null, to_type text not null, category text not null);
    create table if not exists manalink_claims (txn_id bigint references txns(id), manalink_id text references manalinks(id));
  `)
  console.log(
    JSON.stringify({
      sourceRoot,
      postgres: (await db.one('select version()')).version,
      note: 'Actual claim/conversion/queue/txn/retry source; synthetic schema and auth/ban/user conversion/broadcast seams. Fixed localhost only; no production credentials.',
    })
  )
  if (poolBaseline) {
    await poolContention()
    return
  }
  await repro('claimant')
  await repro('creator')
  await baseline()
  if (!expectCycle) {
    await poolContention()
    await reciprocalClaims()
    await concurrentDebit()
    await insertionFailure()
    await postTransferRetry()
  }
}
main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => pgp.end())
