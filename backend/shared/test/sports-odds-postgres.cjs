// Disposable PostgreSQL proof. Actual production settlement/payout/SQL modules.
// No environment loading, cloud credentials or remote services. Synthetic schema.
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const root = path.resolve(__dirname, '../../..').replace(/\\/g, '/')
const rootRequire = createRequire(path.join(root, 'package.json'))
const ts = rootRequire('typescript')
const pgp = rootRequire('pg-promise')()
const proofDir = path.resolve(
  process.env.SPORTS_ODDS_TEST_EVIDENCE_DIR ||
    path.join(root, 'evidence/retry-proof/current')
)
fs.mkdirSync(proofDir, { recursive: true })
const databaseUrl = process.env.SPORTS_ODDS_TEST_DATABASE_URL
if (!databaseUrl)
  throw new Error(
    'Set SPORTS_ODDS_TEST_DATABASE_URL to the disposable loopback pr4178_test database'
  )
const target = new URL(databaseUrl)
if (
  !['postgres:', 'postgresql:'].includes(target.protocol) ||
  target.hostname !== '127.0.0.1' ||
  target.pathname !== '/pr4178_test' ||
  !target.port ||
  target.username !== 'postgres' ||
  target.password ||
  target.search ||
  target.hash
)
  throw new Error(
    'Only the disposable loopback pr4178_test database is allowed'
  )
const db = pgp({
  connectionString: databaseUrl,
  max: 8,
  application_name: 'codex-pr4178-proof',
  statement_timeout: 10000,
})
pgp.pg.types.setTypeParser(1184, (value) => value)
const SERIAL_MODE = new pgp.txMode.TransactionMode({
  tiLevel: pgp.txMode.isolationLevel.serializable,
  readOnly: false,
  deferrable: false,
})
let activeDb = db
let readBarrier
const gates = []
const published = []
const deferred = () => {
  let resolve
  const promise = new Promise((r) => (resolve = r))
  gates.push(resolve)
  return { promise, resolve }
}
const noop = () => {}
const forbidden = () => {
  throw new Error('Unexpected external/nonfixture operation')
}
global.fetch = forbidden
const log = Object.assign(noop, { warn: noop, error: noop })
const overrides = {
  'shared/supabase/init': {
    pgp,
    SERIAL_MODE,
    createSupabaseDirectClient: () => activeDb,
  },
  'shared/publish-sports-live-score': {
    publishSportsLiveScore: (id, score) => published.push({ id, score }),
  },
  'shared/analytics': { trackPublicEvent: noop },
  'shared/record-contract-edit': { recordContractEdit: noop },
  'shared/create-notification': { createContractResolvedNotifications: noop },
  'shared/websockets/helpers': new Proxy({}, { get: () => noop }),
  'shared/monitoring/log': { log },
  'shared/monitoring/metrics': { metrics: {} },
}
const cache = new Map()
const loaded = new Set()
const selections = {
  'backend/shared/src/utils.ts': [
    'contractColumnsToSelect',
    'getContractAndMetricsAndLiquidities',
  ],
  'backend/shared/src/txn/run-txn.ts': ['txnToRow'],
  'backend/shared/src/odds-markets.ts': [
    'writeScorePatch',
    'writeLiveScore',
    'gameTeams',
  ],
}
function load(file) {
  file = path.resolve(root, file).replace(/\\/g, '/')
  if (cache.has(file)) return cache.get(file).exports
  const mod = { exports: {} }
  cache.set(file, mod)
  loaded.add(file)
  let source = fs.readFileSync(file, 'utf8')
  const selected = selections[path.relative(root, file).replace(/\\/g, '/')]
  if (selected) {
    const parsed = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true
    )
    source = parsed.statements
      .filter(
        (s) =>
          ts.isImportDeclaration(s) ||
          selected.includes(s.name?.text) ||
          (ts.isVariableStatement(s) &&
            s.declarationList.declarations.some((d) =>
              selected.includes(d.name.getText(parsed))
            ))
      )
      .map((s) => s.getText(parsed))
      .join('\n')
  }
  if (file.endsWith('/backend/shared/src/odds-markets.ts'))
    source += '\nexport { writeScorePatch, writeLiveScore }'
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText
  const req = (specifier) => {
    let target
    if (specifier.startsWith('.'))
      target = path.resolve(path.dirname(file), specifier)
    else if (specifier.startsWith('common/'))
      target = path.join(root, 'common/src', specifier.slice(7))
    else if (specifier.startsWith('shared/'))
      target = path.join(root, 'backend/shared/src', specifier.slice(7))
    else return rootRequire(specifier)
    const key = target
      .replace(/\\/g, '/')
      .replace(root + '/backend/shared/src/', 'shared/')
      .replace(root + '/common/src/', 'common/')
    if (overrides[key]) return overrides[key]
    if (fs.existsSync(target + '.ts')) return load(target + '.ts')
    if (fs.existsSync(path.join(target, 'index.ts')))
      return load(path.join(target, 'index.ts'))
    throw new Error('Unknown source import ' + specifier + ' from ' + file)
  }
  new Function('require', 'module', 'exports', js + '\n//# sourceURL=' + file)(
    req,
    mod,
    mod.exports
  )
  if (file.endsWith('/backend/shared/src/utils.ts')) {
    const real = mod.exports.getContractAndMetricsAndLiquidities
    mod.exports.getContractAndMetricsAndLiquidities = async (...args) => {
      const value = await real(...args)
      if (readBarrier) {
        const barrier = readBarrier
        barrier.count++
        if (barrier.count === barrier.expected) barrier.entered.resolve()
        await barrier.release.promise
      }
      return value
    }
    Object.assign(mod.exports, {
      isProd: () => true,
      log,
      revalidateStaticProps: noop,
    })
  }
  if (file.endsWith('/backend/shared/src/txn/run-txn.ts'))
    mod.exports.runTxnOutsideBetQueueIgnoringBalance = forbidden
  return mod.exports
}
const { resolveMarketHelper } = load(
  'backend/shared/src/resolve-market-helpers.ts'
)
const { getDefaultMetric } = load('common/src/calculate-metrics.ts')
const { bulkUpdateContractMetrics } = load(
  'backend/shared/src/helpers/user-contract-metrics.ts'
)
const { answerToRow } = load('backend/shared/src/supabase/answers.ts')
const { bulkInsert } = load('backend/shared/src/supabase/utils.ts')
const contract = {
  id: 'game',
  creatorId: 'sports',
  creatorUsername: 'sports',
  slug: 'game',
  visibility: 'public',
  mechanism: 'cpmm-multi-2',
  outcomeType: 'MULTIPLE_CHOICE',
  token: 'MANA',
  shouldAnswersSumToOne: true,
  isResolved: false,
  answers: [],
  subsidyPool: 0,
  totalLiquidity: 100,
  uniqueBettorCount: 2,
  closeTime: Date.now() - 1000,
  createdTime: Date.now() - 100000,
  sportsLiveUpdatedTime: 1000,
}
const user = { id: 'sports' }
const args = { outcome: 'MKT', resolutions: { home: 100, away: 0 } }
const settle = () => resolveMarketHelper(contract, user, user, args)
const results = []
const schema = `
create table contracts(id text primary key,data jsonb not null, token text default 'MANA',importance_score float8,home_page_score_adjustment float8,home_page_score_adjustment_expires_at timestamptz,freshness_score float8,conversion_score float8,view_count bigint default 0,boosted boolean default false,daily_score float8, resolution text generated always as (data->>'resolution') stored);
create table answers(id text primary key,contract_id text,"index" int,user_id text,text text,color text,pool_yes float8,pool_no float8,p float8,prob float8,total_liquidity float8,subsidy_pool float8,created_time timestamptz,is_other boolean,resolution text,resolution_time timestamptz,resolution_probability float8,resolver_id text,prob_change_day float8,prob_change_week float8,prob_change_month float8,image_url text,short_text text,midpoint float8,volume float8);
create table users(id text primary key,balance float8 not null,cash_balance float8 default 0,spice_balance float8 default 0,total_deposits float8 default 0,total_cash_deposits float8 default 0);
create table user_contract_metrics(id bigserial primary key,user_id text,contract_id text,answer_id text,data jsonb,has_shares boolean,profit float8,has_no_shares boolean,has_yes_shares boolean,total_shares_no float8,total_shares_yes float8,loan float8,margin_loan float8);
create unique index metrics_key on user_contract_metrics(user_id,contract_id,coalesce(answer_id,''));
create table contract_liquidity(contract_id text,data jsonb);
create table user_contract_loans(id bigserial primary key,user_id text,contract_id text,answer_id text,loan_day_integral float8,last_loan_update_time bigint);
create table txns(id bigserial primary key,data jsonb,amount float8,token text,from_id text,to_id text,from_type text,to_type text,category text);
`
async function reset() {
  readBarrier = undefined
  activeDb = db
  published.length = 0
  await db.none(
    'truncate contracts,answers,users,user_contract_metrics,contract_liquidity,user_contract_loans,txns restart identity'
  )
  await db.none('insert into contracts(id,data) values($1,$2)', [
    contract.id,
    contract,
  ])
  await db.none("insert into users(id,balance) values('alice',100),('bob',200)")
  await bulkInsert(
    db,
    'answers',
    ['home', 'away'].map((id, index) =>
      answerToRow({
        id,
        contractId: 'game',
        index,
        userId: 'sports',
        text: id,
        createdTime: Date.now() - 100000,
        poolYes: 50,
        poolNo: 50,
        p: 0.5,
        prob: 0.5,
        totalLiquidity: 50,
        subsidyPool: 0,
      })
    )
  )
  const metrics = [
    ['alice', 'home', 100, 0, 40],
    ['bob', 'away', 0, 25, 10],
  ].map(([userId, answerId, yes, no, invested]) => ({
    ...getDefaultMetric(userId, 'game', answerId),
    userId,
    contractId: 'game',
    answerId,
    totalShares: { YES: yes, NO: no },
    invested,
    totalAmountInvested: invested,
    loan: 0,
    marginLoan: 0,
    hasShares: true,
    hasYesShares: yes > 0,
    hasNoShares: no > 0,
    lastProb: 0.5,
    profit: 0,
    payout: 0,
    totalAmountSold: 0,
  }))
  await bulkUpdateContractMetrics(metrics, db)
}
async function snapshot() {
  return {
    users: await db.any('select id,balance from users order by id'),
    txns: await db.any('select to_id,amount,category from txns order by to_id'),
    contract: (await db.one("select data from contracts where id='game'")).data,
    metrics: await db.any(
      'select user_id,answer_id,data from user_contract_metrics order by user_id,answer_id nulls last'
    ),
    answers: await db.any(
      'select id,prob,resolution_time from answers order by id'
    ),
  }
}
function expectPaidOnce(state) {
  assert.deepEqual(state.users, [
    { id: 'alice', balance: 200 },
    { id: 'bob', balance: 225 },
  ])
  assert.equal(state.txns.length, 2)
  assert.equal(
    state.txns.reduce((s, t) => s + t.amount, 0),
    125
  )
  assert.equal(state.contract.isResolved, true)
  assert.equal(state.contract.resolution, 'MKT')
  assert.deepEqual(state.contract.resolutions, { home: 100, away: 0 })
  assert(state.answers.every((a) => a.resolution_time))
  assert.equal(state.metrics.length, 4)
  for (const m of state.metrics) assert(Number.isFinite(m.data.profit))
}
async function test(name, fn) {
  try {
    const details = await fn()
    results.push({ name, passed: true, details })
    console.log(JSON.stringify(results.at(-1)))
  } catch (error) {
    results.push({
      name,
      passed: false,
      error: { message: error.message, code: error.code, stack: error.stack },
    })
    throw error
  }
}
async function main() {
  const identity = await db.one(
    'select current_database() as db,version() as version'
  )
  assert.equal(identity.db, 'pr4178_test')
  console.log(JSON.stringify({ database: identity }))
  await db.none(
    'drop table if exists txns,user_contract_loans,contract_liquidity,user_contract_metrics,users,answers,contracts cascade'
  )
  await db.none(schema)
  await test('actual whole-market payout fixture', async () => {
    await reset()
    await settle()
    const state = await snapshot()
    expectPaidOnce(state)
    return {
      payout: 125,
      ledgerRows: 2,
      users: state.users,
      metrics: state.metrics.length,
    }
  })
  await test('concurrent serializable whole-market settlement commits payouts once', async () => {
    await reset()
    readBarrier = {
      count: 0,
      expected: 2,
      entered: deferred(),
      release: deferred(),
    }
    const barrier = readBarrier
    const calls = Promise.allSettled([settle(), settle()])
    await barrier.entered.promise
    barrier.release.resolve()
    const outcomes = await calls
    readBarrier = undefined
    assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1)
    const rejected = outcomes.find((r) => r.status === 'rejected')
    assert.equal(rejected.reason.code, '40001')
    expectPaidOnce(await snapshot())
    return {
      twoSnapshotsRead: true,
      rejectedCode: rejected.reason.code,
      payout: 125,
    }
  })
  await test('real COMMIT then injected lost acknowledgement: retry does not repay', async () => {
    await reset()
    activeDb = new Proxy(db, {
      get(target, key) {
        if (key === 'tx')
          return async (...params) => {
            await db.tx(...params)
            throw new Error('Injected acknowledgement loss AFTER real COMMIT')
          }
        return Reflect.get(target, key)
      },
    })
    await assert.rejects(settle(), /Injected acknowledgement/)
    activeDb = db
    expectPaidOnce(await snapshot())
    await assert.rejects(
      settle(),
      (e) => e.code === 403 && /already resolved/.test(e.message)
    )
    expectPaidOnce(await snapshot())
    return {
      fault:
        'application-side rejection after actual COMMIT, not physical network fault',
      payout: 125,
    }
  })
  await test('real transaction rollback after payout SQL then retry', async () => {
    await reset()
    activeDb = new Proxy(db, {
      get(target, key) {
        if (key === 'tx')
          return (options, work) =>
            db.tx(options, async (tx) => {
              await work(tx)
              throw new Error('Injected failure before COMMIT')
            })
        return Reflect.get(target, key)
      },
    })
    await assert.rejects(settle(), /before COMMIT/)
    activeDb = db
    const before = await snapshot()
    assert.deepEqual(before.users, [
      { id: 'alice', balance: 100 },
      { id: 'bob', balance: 200 },
    ])
    assert.equal(before.txns.length, 0)
    assert.equal(before.contract.isResolved, false)
    assert(before.answers.every((a) => a.resolution_time === null))
    await settle()
    expectPaidOnce(await snapshot())
    return { rollbackVerified: true, payoutAfterRetry: 125 }
  })
  await scoreProof()
}
async function waitForScoreLock() {
  const started = Date.now()
  while (Date.now() - started < 5000) {
    const row = await db.oneOrNone(
      "select pid from pg_stat_activity where application_name='codex-pr4178-delayed-score' and wait_event_type='Lock'"
    )
    if (row) return row.pid
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('Did not observe actual delayed score row-lock wait')
}
async function scoreProof() {
  const oldDb = pgp({
    connectionString: databaseUrl,
    application_name: 'codex-pr4178-delayed-score',
    statement_timeout: 10000,
  })
  const { writeScorePatch, writeLiveScore } = load(
    'backend/shared/src/odds-markets.ts'
  )
  const run = { isCurrent: () => true, setStage: noop, mutate: (fn) => fn() }
  {
    await test(
      'production guarded score writer' + ' after newer committed score',
      async () => {
        await reset()
        const held = deferred(),
          release = deferred()
        const newer = db.tx(async (tx) => {
          await tx.none(
            'update contracts set data=data || \'{"sportsLiveUpdatedTime":3000,"sportsHomeScore":30}\'::jsonb where id=\'game\''
          )
          held.resolve()
          await release.promise
        })
        await held.promise
        const patch = { sportsLiveUpdatedTime: 2000, sportsHomeScore: 20 }
        const old = writeScorePatch(oldDb, 'game', patch, run)
        const pid = await waitForScoreLock()
        release.resolve()
        await newer
        const accepted = await old
        const state = await snapshot()
        assert.equal(state.contract.sportsHomeScore, 30)
        assert.equal(accepted, false)
        return {
          blockedBackendObserved: pid,
          finalScore: state.contract.sportsHomeScore,
          accepted,
        }
      }
    )
    await test(
      'production guarded score writer' + ' after real settlement COMMIT',
      async () => {
        await reset()
        const held = deferred(),
          release = deferred()
        activeDb = new Proxy(db, {
          get(target, key) {
            if (key === 'tx')
              return (options, work) =>
                db.tx(options, async (tx) => {
                  const value = await work(tx)
                  held.resolve()
                  await release.promise
                  return value
                })
            return Reflect.get(target, key)
          },
        })
        const settlement = settle()
        await held.promise
        activeDb = db
        const patch = {
          sportsLiveUpdatedTime: 2000,
          sportsHomeScore: 20,
          sportsLiveStatus: 'IN_PLAY',
        }
        const old = writeScorePatch(oldDb, 'game', patch, run)
        const pid = await waitForScoreLock()
        release.resolve()
        await settlement
        const accepted = await old
        const state = await snapshot()
        expectPaidOnce(state)
        assert.equal(state.contract.sportsLiveUpdatedTime, 1000)
        assert.equal(accepted, false)
        return {
          blockedBackendObserved: pid,
          resolved: state.contract.isResolved,
          timestamp: state.contract.sportsLiveUpdatedTime,
          payout: 125,
        }
      }
    )
  }
  await test('actual live-score path publishes only SQL-accepted state', async () => {
    await reset()
    const game = {
      contract: { ...contract, sportsHomeTeam: 'Home', sportsAwayTeam: 'Away' },
    }
    const score = {
      home_team: 'Home',
      away_team: 'Away',
      scores: [
        { name: 'Home', score: '20' },
        { name: 'Away', score: '5' },
      ],
    }
    await writeLiveScore(oldDb, game, score, 2000, run)
    assert.equal(published.length, 1)
    const stored = (await snapshot()).contract
    for (const [key, value] of Object.entries(published[0].score))
      assert.deepEqual(stored[key], value)
    await writeLiveScore(
      oldDb,
      game,
      {
        ...score,
        scores: [
          { name: 'Home', score: '99' },
          { name: 'Away', score: '5' },
        ],
      },
      1999,
      run
    )
    assert.equal(published.length, 1)
    assert.equal((await snapshot()).contract.sportsHomeScore, 20)
    return {
      acceptedPublishedOnce: true,
      olderRejectedWithoutPublication: true,
    }
  })
  await oldDb.$pool.end()
}
main()
  .catch((error) => {
    console.error(error.stack)
    process.exitCode = 1
  })
  .finally(async () => {
    for (const release of gates) release()
    await pgp.end()
    fs.writeFileSync(
      path.join(proofDir, 'results.json'),
      JSON.stringify(
        {
          head: require('node:child_process')
            .execFileSync('git', ['rev-parse', 'HEAD'], {
              cwd: root,
              encoding: 'utf8',
            })
            .trim(),
          sourceHashes: [...loaded].map((file) => ({
            path: path.relative(root, file),
            sha256: require('node:crypto')
              .createHash('sha256')
              .update(fs.readFileSync(file))
              .digest('hex'),
          })),
          results,
          loadedSource: [...loaded],
          selectedExports: selections,
          limits: [
            'Synthetic minimal schema, not full migrations/triggers',
            'Real helper, payout math, row conversion, query generation and SQL transactions',
            'Utils loader selects exact source exports to exclude unrelated Firebase/HTML code',
            'Network/postcommit services disabled',
            'Lost acknowledgement is injected after real commit; not a network fault',
          ],
        },
        null,
        2
      )
    )
  })
