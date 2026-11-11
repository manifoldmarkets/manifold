const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const { PGlite } = require('./runtime/node_modules/@electric-sql/pglite')
const { load } = require('./load-ts.cjs')
const random = load('common/src/util/random.ts', {})
const rules = load('common/src/browse-rollout.ts', {
  './ab-test': load('common/src/ab-test.ts', { './util/random': random }),
})
const sql = fs.readFileSync(
  path.join(__dirname, '../browse-redesign-report.sql'),
  'utf8'
)
const day = (n) => `2026-11-${String(n).padStart(2, '0')}T00:00:00Z`
const args = (start = day(1), end = day(4)) => [
  start,
  end,
  day(10),
  rules.BROWSE_EXPOSURE_EVENT,
  rules.BROWSE_TOGGLE_EVENT,
  rules.BROWSE_EXPERIMENT,
  '2026-10-01T00:00:00Z',
]
async function database() {
  const db = new PGlite()
  // Same relevant column types and indexes as backend/supabase/{user_events,
  // users,private_users,contract_bets}. Unused columns/triggers/RLS omitted.
  await db.exec(`
    create table user_events (id bigint generated always as identity primary key, ts timestamptz not null, name text not null, data jsonb not null);
    create index user_events_ts on user_events (ts desc);
    create table users (id text primary key, created_time timestamptz not null);
    create index users_created_time on users (created_time desc);
    create table private_users (id text primary key, data jsonb not null);
    create table contract_bets (bet_id text primary key, user_id text not null, created_time timestamptz not null, amount numeric, shares numeric, is_api boolean, is_redemption boolean, data jsonb);
    create index contract_bets_user_id_created_time on contract_bets (user_id, created_time desc);
    create index contract_bets_created_time_only on contract_bets (created_time desc);
  `)
  return db
}
async function report(db, parameters = args(), explain = false) {
  await db.exec(
    "begin isolation level repeatable read read only; set local enable_nestloop = off; set local statement_timeout = '30s'; set local lock_timeout = '2s'"
  )
  try {
    return (
      await db.query(
        (explain ? 'explain (analyze, format json) ' : '') + sql,
        parameters
      )
    ).rows
  } finally {
    await db.exec('rollback')
  }
}

// Run the real CLI validation and SQL with a fixed clock and an in-memory DB.
async function reportCli(db, start, end, launch) {
  let finish
  const done = new Promise((resolve) => (finish = resolve))
  let rows
  let error
  const pgp = Object.assign(
    () => ({
      tx: (_mode, run) =>
        run({
          none: async () => {},
          manyOrNone: (query, parameters) => {
            assert.equal(query, sql)
            return report(db, parameters)
          },
        }),
    }),
    {
      txMode: {
        TransactionMode: class {},
        isolationLevel: { repeatableRead: 'repeatable read' },
      },
      end: () => finish(),
    }
  )
  load(
    'backend/scripts/browse-redesign-report.ts',
    { 'common/browse-rollout': rules, fs, path, 'pg-promise': () => pgp },
    {
      __dirname: path.join(__dirname, '..'),
      Date: class extends Date {
        constructor(value) {
          super(value ?? day(13))
        }
      },
      process: {
        argv: ['node', 'browse-redesign-report.ts', start, end],
        env: {
          BROWSE_REPORT_DATABASE_URL: 'postgres://unused/report',
          BROWSE_EXPERIMENT_START: launch,
        },
      },
      console: {
        log() {},
        table: (value) => (rows = value),
        error: (...parts) => (error = new Error(parts.join(' '))),
      },
    }
  )
  await done
  if (error) throw error
  return rows
}

test('report CLI includes a midday launch date and rejects launch at or after the end', async () => {
  const db = await database()
  const launch = '2026-11-05T14:00:00Z'
  try {
    for (const [browserId, time] of [
      ['before-only', '2026-11-05T13:00:00Z'],
      ['launch-day', '2026-11-05T13:00:00Z'],
      ['launch-day', launch],
      ['launch-day', day(7)],
      ['after-window', day(6)],
    ]) {
      await db.query(
        'insert into user_events (ts, name, data) values ($1,$2,$3)',
        [
          time,
          rules.BROWSE_EXPOSURE_EVENT,
          {
            experiment: rules.BROWSE_EXPERIMENT,
            environment: 'production',
            browserId,
            deviceId: browserId,
            cohort: 'new-visitor',
            variant: 'control',
            signedInAtEnrollment: false,
          },
        ]
      )
    }
    await db.exec(`
      insert into users values ('pre-launch','2026-11-05T13:00Z'),('signup','2026-11-05T15:00Z');
      insert into private_users values ('pre-launch','{"initialDeviceToken":"launch-day"}'),('signup','{"initialDeviceToken":"launch-day"}');
      insert into contract_bets values ('trade','signup','2026-11-05T16:00Z',10,20,false,false);
    `)
    const rows = await reportCli(db, '2026-11-05', '2026-11-06', launch)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].browsers, 1)
    assert.equal(rows[0].mature_browsers, 1)
    assert.equal(rows[0].signups_7d, 1)
    assert.equal(rows[0].activated_7d, 1)
    assert.equal(rows[0].returned_days_1_to_7, 1)
    // The account and its bet came an hour and two hours after the visit.
    assert.equal(rows[0].mature_day_browsers, 1)
    assert.equal(rows[0].signup_rate_1d, '100.00%')
    assert.equal(rows[0].activation_rate_1d, '100.00%')
    for (const lateLaunch of [day(6), '2026-11-06T14:00:00Z']) {
      await assert.rejects(
        reportCli(db, '2026-11-05', '2026-11-06', lateLaunch),
        /BROWSE_EXPERIMENT_START before the cohort end/
      )
    }
  } finally {
    await db.close()
  }
})

test('report preserves first assignment, UTC windows, maturity, rotating tokens and funded signup activation', async () => {
  const db = await database()
  try {
    const event = async (
      browserId,
      time,
      props = {},
      name = rules.BROWSE_EXPOSURE_EVENT
    ) => {
      await db.query(
        'insert into user_events (ts, name, data) values ($1,$2,$3)',
        [
          time,
          name,
          {
            experiment: rules.BROWSE_EXPERIMENT,
            environment: 'production',
            browserId,
            deviceId: browserId,
            cohort: 'new-visitor',
            variant: 'control',
            mobile: false,
            signedInAtEnrollment: false,
            existingUser: false,
            ...props,
          },
        ]
      )
    }
    await event('converted', day(1))
    await event('converted', day(2), { deviceId: 'after-logout' })
    await event(
      'converted',
      day(3),
      { view: 'legacy' },
      rules.BROWSE_TOGGLE_EVENT
    )
    await event('converted', day(3), { view: 'new' }, rules.BROWSE_TOGGLE_EVENT)
    await event('converted', day(4), { existingUser: true })
    await event('cohort-conflict', day(1))
    await event('cohort-conflict', day(2), { cohort: 'prior-choice' })
    await event('variant-conflict', day(1))
    await event('variant-conflict', day(2), { variant: 'treatment' })
    await event('seven-day-boundary', day(1))
    await event('seven-day-boundary', day(8)) // excluded from return window
    await event('api-only', day(1))
    await event('unfunded', day(1))
    await event('immature', day(4), { variant: 'treatment' })
    await event('immature', day(5), { variant: 'treatment' })
    await event('existing', day(1), {
      cohort: 'existing-user',
      variant: null,
      signedInAtEnrollment: true,
    })
    await event('earlier', '2026-10-31T00:00:00Z')
    await event('earlier', day(2)) // not a new entrant
    await event('preview', day(1), { environment: 'preview' })
    await event('old-experiment', day(1), { experiment: 'old' })
    await event('', day(1))
    await event('future', day(11))
    await db.exec(`
      insert into users values ('u1','2026-11-02'),('u2','2026-11-02'),('u3','2026-11-02'),('late','2026-11-08');
      insert into private_users values ('u1','{"initialDeviceToken":"after-logout"}'),('u2','{"initialDeviceToken":"api-only"}'),('u3','{"initialDeviceToken":"unfunded"}'),('late','{"initialDeviceToken":"seven-day-boundary"}');
      insert into contract_bets values
        ('b1','u1','2026-11-02',10,20,false,false),
        ('b2','u1','2026-11-03',5,10,false,false),
        ('api','u2','2026-11-03',10,20,true,false),
        ('unfilled','u3','2026-11-03',0,0,false,false),
        ('redeem','u3','2026-11-03',10,20,false,true),
        ('latebet','u3','2026-11-08',10,20,false,false);
    `)
    const rows = await report(db, args(day(1), day(5)))
    const control = rows.find((r) => r.variant === 'control')
    assert.deepEqual(control, {
      cohort: 'new-visitor',
      variant: 'control',
      signed_in_at_entry: 'false',
      mobile_at_entry: 'false',
      browsers: 6,
      mature_browsers: 6,
      returned_days_1_to_7: 3,
      signups_7d: 3,
      activated_7d: 1,
      // Every account here was made exactly a day after its first visit,
      // which is outside the one-day window.
      mature_day_browsers: 6,
      signups_1d: 0,
      activated_1d: 0,
      chose_new_7d: 1,
      chose_classic_7d: 1,
      existing_account_7d: 1,
      assignment_conflicts: 2,
    })
    const treatment = rows.find((r) => r.variant === 'treatment')
    assert.equal(treatment.browsers, 1)
    assert.equal(treatment.mature_browsers, 0)
    assert.equal(treatment.returned_days_1_to_7, 0)
    // Six days old at the as-of: past the one-day window, short of seven.
    assert.equal(treatment.mature_day_browsers, 1)
    assert.equal(rows.find((r) => r.cohort === 'existing-user').browsers, 1)
    assert.deepEqual(await report(db, args(day(2), day(4))), [])
  } finally {
    await db.close()
  }
})

test('one-day outcomes count only what landed within a day, for browsers a day old', async () => {
  const db = await database()
  try {
    const enter = (browserId, time, variant = 'control') =>
      db.query('insert into user_events (ts, name, data) values ($1,$2,$3)', [
        time,
        rules.BROWSE_EXPOSURE_EVENT,
        {
          experiment: rules.BROWSE_EXPERIMENT,
          environment: 'production',
          browserId,
          deviceId: browserId,
          cohort: 'new-visitor',
          variant,
          mobile: false,
          signedInAtEnrollment: false,
        },
      ])
    const hour = (n) =>
      new Date(Date.parse(day(1)) + n * 3600 * 1000).toISOString()
    // Signs up and bets the same day.
    await enter('same-day', day(1))
    // Signs up the same day, first bet two days later.
    await enter('late-bet', day(1))
    // Signs up on day two.
    await enter('late-signup', day(1))
    // Bets in the last minute of the day, and one at exactly a day.
    await enter('edge', day(1))
    await enter('edge-out', day(1))
    // Places a limit order the same day that first fills two days later.
    await enter('late-fill', day(1))
    // Places a limit order the same day that part fills within the day.
    await enter('early-fill', day(1))
    // Never signs up.
    await enter('nothing', day(1))
    // Entered less than a day before the as-of.
    await enter('fresh', '2026-11-09T12:00:00Z', 'treatment')
    await db.query(
      `insert into users values
        ('u-same',$1),('u-late-bet',$1),('u-late-signup',$2),('u-edge',$1),('u-edge-out',$1),('u-late-fill',$1),('u-early-fill',$1),('u-fresh','2026-11-09T12:05:00Z')`,
      [hour(2), hour(30)]
    )
    await db.exec(`
      insert into private_users values
        ('u-same','{"initialDeviceToken":"same-day"}'),
        ('u-late-bet','{"initialDeviceToken":"late-bet"}'),
        ('u-late-signup','{"initialDeviceToken":"late-signup"}'),
        ('u-edge','{"initialDeviceToken":"edge"}'),
        ('u-edge-out','{"initialDeviceToken":"edge-out"}'),
        ('u-late-fill','{"initialDeviceToken":"late-fill"}'),
        ('u-early-fill','{"initialDeviceToken":"early-fill"}'),
        ('u-fresh','{"initialDeviceToken":"fresh"}');
    `)
    await db.query(
      `insert into contract_bets values
        ('b-same','u-same',$1,10,20,false,false),
        ('b-late','u-late-bet',$2,10,20,false,false),
        ('b-late-signup','u-late-signup',$3,10,20,false,false),
        ('b-edge','u-edge',$4,10,20,false,false),
        ('b-edge-out','u-edge-out',$5,10,20,false,false),
        ('b-fresh','u-fresh','2026-11-09T12:10:00Z',10,20,false,false)`,
      [hour(3), hour(50), hour(31), '2026-11-01T23:59:00Z', day(2)]
    )
    const fills = (...entries) => ({
      fills: entries.map(([amount, time]) => ({
        matchedBetId: null,
        amount,
        shares: amount * 2,
        timestamp: Date.parse(time),
      })),
    })
    await db.query(
      `insert into contract_bets values
        ('b-late-fill','u-late-fill',$1,10,20,false,false,$2),
        ('b-early-fill','u-early-fill',$1,10,20,false,false,$3)`,
      [
        hour(4),
        fills([0, hour(4)], [10, hour(52)]),
        fills([4, hour(20)], [6, hour(80)]),
      ]
    )
    const rows = await report(db, args(day(1), day(10)))
    const control = rows.find((r) => r.variant === 'control')
    assert.equal(control.browsers, 8)
    assert.equal(control.mature_day_browsers, 8)
    // Everyone but late-signup and nothing signed up within a day.
    assert.equal(control.signups_1d, 6)
    // same-day and edge bet within a day, and early-fill's order part filled
    // within it. edge-out's bet is a minute late, and late-fill's order sat
    // unfilled until day three.
    assert.equal(control.activated_1d, 3)
    // The seven-day columns still count everyone who got there in the week.
    assert.equal(control.mature_browsers, 8)
    assert.equal(control.signups_7d, 7)
    assert.equal(control.activated_7d, 7)
    const treatment = rows.find((r) => r.variant === 'treatment')
    assert.equal(treatment.browsers, 1)
    assert.equal(treatment.mature_day_browsers, 0)
    assert.equal(treatment.signups_1d, 0)
    assert.equal(treatment.activated_1d, 0)
  } finally {
    await db.close()
  }
})

test('report groups 84,000 events without rescanning the event CTE per browser', async (t) => {
  const db = await database()
  try {
    await db.query(
      `insert into user_events (ts,name,data)
      select '2026-11-01'::timestamptz + step * interval '6 hours', $1,
        jsonb_build_object('experiment',$2::text,'environment','production',
          'browserId','browser-' || browser,'deviceId','token-' || browser,
          'cohort','new-visitor','variant',case when browser % 2 = 0 then 'control' else 'treatment' end,
          'signedInAtEnrollment',false,'mobile',false)
      from generate_series(1,4000) browser cross join generate_series(0,20) step`,
      [rules.BROWSE_EXPOSURE_EVENT, rules.BROWSE_EXPERIMENT]
    )
    await db.exec(`insert into user_events (ts,name,data)
      select '2026-09-01'::timestamptz + n * interval '1 second','background','{}'::jsonb from generate_series(1,200000) n;
      insert into users select 'user-' || n, '2026-11-02' from generate_series(1,4000) n;
      insert into private_users select 'user-' || n, jsonb_build_object('initialDeviceToken','token-' || n) from generate_series(1,4000) n;
      insert into contract_bets select 'bet-' || n, 'user-' || n, '2026-11-03', 10, 20, false, false from generate_series(1,4000) n;
      analyze;`)
    const start = performance.now()
    const rows = await report(db)
    const elapsed = performance.now() - start
    assert.equal(rows.length, 2)
    for (const row of rows) {
      assert.equal(row.browsers, 2000)
      assert.equal(row.returned_days_1_to_7, 2000)
      assert.equal(row.signups_7d, 2000)
      assert.equal(row.activated_7d, 2000)
      assert.equal(row.assignment_conflicts, 0)
    }
    const explained = await report(db, args(), true)
    const plan = explained[0]['QUERY PLAN'][0]
    let eventScans = 0
    function check(node) {
      if (node['Node Type'] === 'CTE Scan' && node['CTE Name'] === 'events') {
        eventScans++
        assert.ok(
          node['Actual Loops'] <= 1,
          'event CTE must not be rescanned per entrant'
        )
      }
      for (const child of node.Plans ?? []) check(child)
    }
    check(plan.Plan)
    assert.ok(eventScans > 0)
    t.diagnostic(
      `PGlite/PostgreSQL: 4,000 browsers, 84,000 experiment + 200,000 background events; report ${elapsed.toFixed(
        0
      )} ms; EXPLAIN execution ${plan['Execution Time']} ms`
    )
  } finally {
    await db.close()
  }
})
