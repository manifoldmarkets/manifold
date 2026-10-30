// Real-PostgreSQL regression tests for the Uninterested feature, against the
// SQL the backend actually runs: the migration, the race between Undo and
// new-market propagation (two connections, both orderings, synchronised on
// observed lock waits rather than on sleeps), mark ownership, and the
// cold-start topic penalty. Requires Docker with the pgvector/pgvector:pg16
// image cached; no network, credentials or mounted data.
// Run from the repo root: node --test backend/scripts/tests/user-disinterests.test.cjs
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { randomUUID } = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { after, before, beforeEach, test } = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')
const pgPromise = require('pg-promise')

const root = path.resolve(__dirname, '../../..')
const IMAGE = 'pgvector/pgvector:pg16'
const container = `user-disinterests-test-${randomUUID()}`
const docker = (args, input) =>
  execFileSync('docker', args, {
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  })

// --- The TypeScript under test, loaded as is ------------------------------
const pgp = pgPromise()
class APIError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}
const shims = {
  'common/api/utils': { APIError },
  'shared/supabase/init': { pgp },
  './init': { pgp },
  lodash: require('lodash'),
}
const sources = {
  'common/disinterests': 'common/src/disinterests.ts',
  'common/feed': 'common/src/feed.ts',
  'common/util/array': 'common/src/util/array.ts',
  'shared/supabase/sql-builder': 'backend/shared/src/supabase/sql-builder.ts',
  'shared/supabase/user-disinterests':
    'backend/shared/src/supabase/user-disinterests.ts',
  'shared/supabase/trending-contracts':
    'backend/shared/src/supabase/trending-contracts.ts',
}
const loaded = {}
const load = (name) => {
  if (shims[name]) return shims[name]
  if (loaded[name]) return loaded[name]
  const file = sources[name]
  if (!file) throw new Error(`Unexpected dependency: ${name}`)
  const js = ts.transpileModule(
    fs.readFileSync(path.join(root, file), 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }
  ).outputText
  const module = { exports: {} }
  loaded[name] = module.exports
  vm.runInThisContext(`(function (exports, require, module) {${js}\n})`, {
    filename: file,
  })(module.exports, load, module)
  loaded[name] = module.exports
  return module.exports
}
const {
  setContractUninterested,
  hideNearDuplicatesOfNewContract,
  isContractUninterested,
  rankWithDisinterestPenalty,
} = load('shared/supabase/user-disinterests')
// The cold-start ranking arrived with the AU4156-05 fix. Against an older
// revision the race and ownership tests still run and the ranking tests skip,
// which is how the race tests were shown to fail on the pre-fix code.
const ranking = (() => {
  try {
    return load('shared/supabase/trending-contracts')
  } catch {
    return undefined
  }
})()
const { trendingContractsForUserSql, trendingContractsSql } = ranking ?? {}
const skipRanking = ranking
  ? false
  : 'this revision has no cold-start ranking module'
const {
  DISINTEREST_TOPIC_WINDOW_DAYS,
  MIN_DISINTEREST_TOPIC_MULTIPLIER,
  NEAR_DUPLICATE_SIMILARITY_THRESHOLD,
} = load('common/disinterests')

// --- Schema ---------------------------------------------------------------
// Only the columns the statements under test touch; the real contracts table
// carries triggers and generated columns that need the whole schema loaded.
const SCHEMA = `
  create extension if not exists vector;
  create table contracts (
    id text primary key,
    data jsonb not null default '{}'::jsonb,
    creator_id text,
    visibility text not null default 'public',
    deleted boolean not null default false,
    resolution_time timestamptz,
    close_time timestamptz,
    importance_score numeric not null default 0,
    conversion_score numeric not null default 0,
    freshness_score numeric not null default 0,
    view_count numeric not null default 0,
    token text not null default 'MANA',
    outcome_type text not null default 'BINARY',
    unique_bettor_count integer not null default 0,
    created_time timestamptz not null default now()
  );
  create table contract_embeddings (
    contract_id text primary key,
    embedding vector(1536) not null
  );
  create table groups (id text primary key, slug text not null);
  create table group_contracts (
    contract_id text not null,
    group_id text not null references groups (id),
    primary key (group_id, contract_id)
  );
  create index group_contracts_contract_id on group_contracts (contract_id);
`
// user_disinterests exactly as it was before this PR: no uniqueness, so the
// old append-only button could leave duplicates behind.
const OLD_USER_DISINTERESTS = `
  create table user_disinterests (
    comment_id text,
    contract_id text not null,
    created_time timestamp with time zone default now() not null,
    creator_id text not null,
    feed_id bigint,
    id bigint primary key generated always as identity not null,
    user_id text not null
  );
  create index user_disinterests_user_id on user_disinterests (user_id);
  create index user_disinterests_user_id_contract_id on user_disinterests (user_id, contract_id);
`
const MIGRATION = fs
  .readFileSync(
    path.join(
      root,
      'backend/supabase/migrations/2026101301_user_disinterests_unique_and_source.sql'
    ),
    'utf8'
  )
  .replace(/\r/g, '')

// A 1536-dimension vector with the given first two coordinates; the rest zero.
const vec = (x, y) => `[${[x, y, ...new Array(1534).fill(0)].join(',')}]`
const deferred = () => {
  let resolve
  const promise = new Promise((r) => (resolve = r))
  return { promise, resolve }
}
// A db whose transactions run the caller's statements, then pause before
// committing until released: the way to hold a lock across another
// connection's attempt to take it.
const pausedTx = (db, afterBody) => ({
  tx: (fn) =>
    db.tx(async (tx) => {
      const result = await fn(tx)
      await afterBody()
      return result
    }),
})

let db
let started = false

before(async () => {
  docker([
    'run',
    '-d',
    '--name',
    container,
    '-p',
    '127.0.0.1::5432',
    '-e',
    'POSTGRES_PASSWORD=postgres',
    IMAGE,
  ])
  started = true
  for (let i = 0; i < 60; i++) {
    try {
      docker(['exec', container, 'pg_isready', '-U', 'postgres'])
      break
    } catch {
      await new Promise((r) => setTimeout(r, 500))
    }
  }
  const port = docker(['port', container, '5432']).trim().split(':').pop()
  db = pgp({
    host: '127.0.0.1',
    port: Number(port),
    database: 'postgres',
    user: 'postgres',
    password: 'postgres',
    max: 6,
  })
  for (let i = 0; i < 60; i++) {
    try {
      await db.one('select 1 as ok')
      break
    } catch {
      await new Promise((r) => setTimeout(r, 500))
    }
  }
  await db.none(SCHEMA)
})

after(async () => {
  if (db) await db.$pool.end()
  if (started) docker(['rm', '-f', container])
})

test('migration dedupes legacy rows, keeps the oldest, and adds the unique key and source column', async () => {
  await db.none(OLD_USER_DISINTERESTS)
  await db.none(
    `insert into user_disinterests (user_id, contract_id, creator_id, created_time) values
       ('u', 'a', 'x', now() - interval '3 days'),
       ('u', 'a', 'x', now() - interval '2 days'),
       ('u', 'a', 'x', now() - interval '1 day'),
       ('u', 'b', 'x', now()),
       ('v', 'a', 'x', now())`
  )
  await db.none(MIGRATION)
  const rows = await db.any(
    `select user_id, contract_id, source_contract_id, id from user_disinterests order by user_id, contract_id`
  )
  assert.deepEqual(
    rows.map((r) => [r.user_id, r.contract_id, r.source_contract_id]),
    [
      ['u', 'a', null],
      ['u', 'b', null],
      ['v', 'a', null],
    ]
  )
  // The surviving (u, a) row is the oldest one.
  const kept = await db.one(
    `select created_time < now() - interval '2 days 23 hours' as oldest from user_disinterests where user_id = 'u' and contract_id = 'a'`
  )
  assert.equal(kept.oldest, true)
  const unique = await db.one(
    `select count(*)::int as n from pg_indexes where tablename = 'user_disinterests' and indexname = 'user_disinterests_user_id_contract_id_unique'`
  )
  assert.equal(unique.n, 1)
  await assert.rejects(
    db.none(
      `insert into user_disinterests (user_id, contract_id, creator_id) values ('u', 'a', 'x')`
    ),
    /duplicate key/
  )
  // Rerunning is harmless.
  await db.none(MIGRATION)
  await db.none('truncate user_disinterests')
})

const seedMarkets = async () => {
  await db.none(
    `
    insert into contracts (id, creator_id, importance_score) values
      ('a', 'maker', 1),
      ('b', 'maker', 1),
      ('c', 'maker', 1),
      ('z', 'maker', 1);
    insert into contract_embeddings (contract_id, embedding) values
      ('a', $1::vector), ('b', $2::vector), ('c', $3::vector), ('z', $4::vector);
  `,
    [vec(1, 0), vec(0, 1), vec(0.99, 0.01), vec(-1, 0)]
  )
}
const newMarket = async (id, x, y) => {
  await db.none(
    `insert into contracts (id, creator_id, importance_score) values ($1, 'author', 1);
     insert into contract_embeddings (contract_id, embedding) values ($1, $2::vector)`,
    [id, vec(x, y)]
  )
}
// New markets outlive a truncate of user_disinterests, and the next mark on
// `a` would derive them too; each race test starts without them.
const clearNewMarkets = () =>
  db.none(
    `delete from contract_embeddings where contract_id like 'n%';
     delete from contracts where id like 'n%'`
  )
const rowsOf = (userId) =>
  db.map(
    `select contract_id, source_contract_id from user_disinterests where user_id = $1 order by contract_id`,
    [userId],
    (r) => [r.contract_id, r.source_contract_id]
  )
// Observed barrier: resolves once some other backend is waiting on a row lock
// inside a statement matching `pattern`. Bounded, and never a bare sleep.
const waitForLockWait = async (pattern) => {
  for (let i = 0; i < 400; i++) {
    const { n } = await db.one(
      `select count(*)::int as n from pg_stat_activity
       where wait_event_type = 'Lock' and query ilike $1`,
      [pattern]
    )
    if (n > 0) return
    await new Promise((r) => setTimeout(r, 25))
  }
  assert.fail(`no backend ever waited on a lock in a statement like ${pattern}`)
}

test('marks: idempotent, near-duplicates derived, promotion and independent marks preserved across Undo', async () => {
  await seedMarkets()
  assert.deepEqual(await setContractUninterested(db, 'u', 'a', true), {
    uninterested: true,
    hiddenSimilarCount: 1,
  })
  assert.deepEqual(await rowsOf('u'), [
    ['a', null],
    ['c', 'a'],
  ])
  // A repeat click adds nothing and derives nothing new.
  assert.deepEqual(await setContractUninterested(db, 'u', 'a', true), {
    uninterested: true,
    hiddenSimilarCount: 0,
  })
  assert.deepEqual(await rowsOf('u'), [
    ['a', null],
    ['c', 'a'],
  ])
  assert.equal(await isContractUninterested(db, 'u', 'c'), true)

  // An independent mark on b, then marking the derived c directly promotes it.
  await setContractUninterested(db, 'u', 'b', true)
  await setContractUninterested(db, 'u', 'c', true)
  assert.deepEqual(await rowsOf('u'), [
    ['a', null],
    ['b', null],
    ['c', null],
  ])
  // Undoing a leaves the promoted c and the independent b alone.
  await setContractUninterested(db, 'u', 'a', false)
  assert.deepEqual(await rowsOf('u'), [
    ['b', null],
    ['c', null],
  ])
  // Undo twice is fine.
  await setContractUninterested(db, 'u', 'a', false)
  await setContractUninterested(db, 'u', 'c', false)
  assert.deepEqual(await rowsOf('u'), [['b', null]])
  // Another user's marks are untouched throughout.
  await setContractUninterested(db, 'v', 'a', true)
  await setContractUninterested(db, 'u', 'b', false)
  assert.deepEqual(await rowsOf('u'), [])
  assert.deepEqual(await rowsOf('v'), [
    ['a', null],
    ['c', 'a'],
  ])
  await db.none('truncate user_disinterests')
})

test('a new near-duplicate market is hidden for marking users, never its creator, and Undo of the source takes it along', async () => {
  await setContractUninterested(db, 'u', 'a', true)
  await setContractUninterested(db, 'author', 'a', true)
  await newMarket('n0', 0.98, 0.02)
  assert.equal(
    await hideNearDuplicatesOfNewContract(db, {
      id: 'n0',
      creatorId: 'author',
      visibility: 'public',
    }),
    1
  )
  assert.deepEqual(await rowsOf('u'), [
    ['a', null],
    ['c', 'a'],
    ['n0', 'a'],
  ])
  assert.deepEqual(await rowsOf('author'), [
    ['a', null],
    ['c', 'a'],
  ])
  // Unlisted markets are left alone entirely.
  assert.equal(
    await hideNearDuplicatesOfNewContract(db, {
      id: 'n0',
      creatorId: 'author',
      visibility: 'unlisted',
    }),
    0
  )
  await setContractUninterested(db, 'u', 'a', false)
  assert.deepEqual(await rowsOf('u'), [])
  await db.none('truncate user_disinterests')
})

test('race, propagation first: Undo waits for the uncommitted derived hide and then removes it', async () => {
  await clearNewMarkets()
  await setContractUninterested(db, 'u', 'a', true)
  await newMarket('n1', 0.97, 0.03)

  const inserted = deferred()
  const release = deferred()
  const creation = hideNearDuplicatesOfNewContract(
    pausedTx(db, async () => {
      inserted.resolve()
      await release.promise
    }),
    { id: 'n1', creatorId: 'author', visibility: 'public' }
  )
  await inserted.promise
  try {
    // The derived hide exists but is invisible to everyone else.
    assert.deepEqual(await rowsOf('u'), [
      ['a', null],
      ['c', 'a'],
    ])

    const undo = setContractUninterested(db, 'u', 'a', false)
    // Fixed code: Undo waits on the mark's lock, which the barrier observes.
    // Pre-fix code: Undo finishes at once; the race then lets the orphan
    // assertion below report it rather than timing out the barrier.
    await Promise.race([waitForLockWait('%for update%'), undo])
    release.resolve()
    const [hiddenFor, undone] = await Promise.all([creation, undo])

    assert.equal(hiddenFor, 1)
    assert.deepEqual(undone, { uninterested: false, hiddenSimilarCount: 0 })
    assert.deepEqual(
      await rowsOf('u'),
      [],
      'a hide derived from the undone mark survived the Undo'
    )
  } finally {
    // A failed assertion must not leave the paused transaction holding its
    // locks, or every later statement waits on it forever.
    release.resolve()
    await creation.catch(() => undefined)
  }
})

test('race, Undo first: propagation waits, then re-reads the deleted mark as gone and derives nothing', async () => {
  await clearNewMarkets()
  await setContractUninterested(db, 'u', 'a', true)
  await setContractUninterested(db, 'v', 'a', true)
  await newMarket('n2', 0.96, 0.04)

  const deleted = deferred()
  const release = deferred()
  const undo = setContractUninterested(
    pausedTx(db, async () => {
      deleted.resolve()
      await release.promise
    }),
    'u',
    'a',
    false
  )
  await deleted.promise
  try {
    const creation = hideNearDuplicatesOfNewContract(db, {
      id: 'n2',
      creatorId: 'author',
      visibility: 'public',
    })
    // Fixed code: propagation waits on the locked mark, which the barrier
    // observes. Pre-fix code: it finishes at once and derives from a mark
    // that is being deleted; the orphan assertion below reports it.
    await Promise.race([waitForLockWait('%for key share%'), creation])
    release.resolve()
    const [undone, hiddenFor] = await Promise.all([undo, creation])

    assert.deepEqual(undone, { uninterested: false, hiddenSimilarCount: 0 })
    // Only v, whose mark survived, gets the new hide.
    assert.equal(hiddenFor, 1, 'the deleted mark still produced a hide')
    assert.deepEqual(
      await rowsOf('u'),
      [],
      'a hide derived from the undone mark was committed after the Undo'
    )
    assert.deepEqual(await rowsOf('v'), [
      ['a', null],
      ['c', 'a'],
      ['n2', 'a'],
    ])
  } finally {
    release.resolve()
    await undo.catch(() => undefined)
  }
  await db.none('truncate user_disinterests')
  await clearNewMarkets()
})

// --- Cold-start ranking ---------------------------------------------------
const ids = (rows) => rows.map((r) => r.id)
const ranked = async (userId, limit, offset) =>
  ids(
    await db.any(await trendingContractsForUserSql(db, userId, limit, offset))
  )

test(
  'cold-start ranking: recent marks hide their markets and sink their topics without touching the rest',
  { skip: skipRanking },
  async () => {
    await db.none(`
    delete from group_contracts; delete from groups; delete from contract_embeddings; delete from contracts;
    insert into groups (id, slug) values ('T', 't'), ('U', 'u');
    insert into contracts (id, creator_id, importance_score, freshness_score) values
      ('m', 'maker', 100, 100),
      ('c1', 'maker', 10, 1),
      ('c2', 'maker', 8, 2),
      ('c3', 'maker', 7, 3),
      ('c4', 'maker', 6, 4),
      ('c5', 'maker', 4, 5),
      ('c6', 'maker', 1, 6);
    insert into group_contracts (group_id, contract_id) values
      ('T', 'm'), ('T', 'c1'), ('T', 'c3'), ('U', 'c2');
  `)
    // r marked m recently; c4 is hidden for r as a derived hide of m.
    await db.none(`
    insert into user_disinterests (user_id, contract_id, creator_id, source_contract_id, created_time) values
      ('r', 'm', 'maker', null, now() - interval '1 day'),
      ('r', 'c4', 'maker', 'm', now() - interval '1 day'),
      ('stale', 'm', 'maker', null, now() - make_interval(days => ${DISINTEREST_TOPIC_WINDOW_DAYS} + 20))
  `)

    // T halves: c1 10→5, c3 7→3.5. U and untagged markets keep their scores.
    assert.deepEqual(await ranked('r', 10, 0), ['c2', 'c1', 'c5', 'c3', 'c6'])
    // A user with no marks at all gets the plain trending order, m included.
    assert.deepEqual(await ranked('nobody', 10, 0), [
      'm',
      'c1',
      'c2',
      'c3',
      'c4',
      'c5',
      'c6',
    ])
    assert.deepEqual(
      ids(await db.any(trendingContractsSql({ limit: 10, offset: 0 }))),
      ['m', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6']
    )
    // A mark older than the window still hides its market but no longer weighs
    // on its topic.
    assert.deepEqual(await ranked('stale', 10, 0), [
      'c1',
      'c2',
      'c3',
      'c4',
      'c5',
      'c6',
    ])
  }
)

test(
  'cold-start ranking: pages of one visit partition the same re-ranked window',
  { skip: skipRanking },
  async () => {
    const pages = []
    for (let offset = 0; offset < 6; offset += 2) {
      pages.push(await ranked('r', 2, offset))
    }
    assert.deepEqual(pages, [['c2', 'c1'], ['c5', 'c3'], ['c6']])
  }
)

test(
  'cold-start ranking: many marks reach the floor, never a block',
  { skip: skipRanking },
  async () => {
    await db.none(`
    insert into contracts (id, creator_id, importance_score)
      select 't' || g, 'maker', 0 from generate_series(1, 10) g;
    insert into group_contracts (group_id, contract_id)
      select 'T', 't' || g from generate_series(1, 10) g;
    insert into user_disinterests (user_id, contract_id, creator_id)
      select 'floor', 't' || g, 'maker' from generate_series(1, 10) g;
  `)
    // T at the floor: m 100→5, c1 10→0.5 and c3 7→0.35 sink under the untagged
    // and U markets, but all of them stay listed.
    assert.equal(MIN_DISINTEREST_TOPIC_MULTIPLIER, 0.05)
    assert.deepEqual(await ranked('floor', 10, 0), [
      'c2',
      'c4',
      'm',
      'c5',
      'c6',
      'c1',
      'c3',
    ])
  }
)

test(
  'cold-start ranking: the wrapper penalizes a freshness-sorted contracts.* window the same way',
  { skip: skipRanking },
  async () => {
    const sql = rankWithDisinterestPenalty({
      candidatesSql:
        'select contracts.* from contracts where freshness_score > 0 order by freshness_score desc limit 200',
      scoreColumn: 'freshness_score',
      penalties: { topicIds: ['T'], multipliers: [0.5] },
      limit: 10,
      offset: 0,
    })
    // Freshness: m 100→50, c6 6, c5 5, c4 4, c3 3→1.5, c2 2, c1 1→0.5.
    assert.deepEqual(ids(await db.any(sql)), [
      'm',
      'c6',
      'c5',
      'c4',
      'c2',
      'c3',
      'c1',
    ])
  }
)

test('near-duplicate threshold is the calibrated one', () => {
  assert.equal(NEAR_DUPLICATE_SIMILARITY_THRESHOLD, 0.9)
})
