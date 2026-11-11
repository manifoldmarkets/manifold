// The signed-out bet scorecard against an in-memory Postgres:
// node --test backend/scripts/tests/signed-out-bet-report.test.cjs
const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const { PGlite } = require('./runtime/node_modules/@electric-sql/pglite')
const { load } = require('./load-ts.cjs')
const random = load('common/src/util/random.ts', {})
const rules = load('common/src/signed-out-bet.ts', {
  './ab-test': load('common/src/ab-test.ts', { './util/random': random }),
})
const sql = fs.readFileSync(
  path.join(__dirname, '../signed-out-bet-report.sql'),
  'utf8'
)

const START = '2026-12-02T00:00:00Z'
const END = '2026-12-09T00:00:00Z'
const AS_OF = '2026-12-10T00:00:00Z'
const T0 = Date.parse('2026-12-03T12:00:00Z')
const at = (ms) => new Date(T0 + ms).toISOString()
const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const args = (start = START, end = END, asOf = AS_OF) => [
  start,
  end,
  asOf,
  rules.SIGNED_OUT_BET_TEST,
  rules.SIGNED_OUT_BET_SIGN_IN_EVENT,
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
    "begin isolation level repeatable read read only; set local enable_nestloop = off; set local statement_timeout = '30s'"
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

function seed(db) {
  let bets = 0
  // A device's first press carries first: true; pass { first: false } for the
  // exposures its later page loads log.
  const press = (deviceId, ms, variant, surface, extra = {}) =>
    db.query('insert into user_events (ts, name, data) values ($1,$2,$3)', [
      at(ms),
      rules.SIGNED_OUT_BET_TEST,
      {
        deviceId,
        variant,
        surface,
        first: true,
        forced: false,
        environment: 'production',
        assignmentUnit: 'device',
        location: surface === 'ticket' ? 'bet panel' : 'contract table',
        ...extra,
      },
    ])
  const signIn = (deviceId, ms, variant, result, extra = {}) =>
    db.query('insert into user_events (ts, name, data) values ($1,$2,$3)', [
      at(ms),
      rules.SIGNED_OUT_BET_SIGN_IN_EVENT,
      {
        deviceId,
        variant,
        result,
        forced: false,
        environment: 'production',
        ...extra,
      },
    ])
  const account = async (id, ms, initialDeviceToken) => {
    await db.query('insert into users values ($1,$2)', [id, at(ms)])
    await db.query('insert into private_users values ($1,$2)', [
      id,
      { initialDeviceToken },
    ])
  }
  // `fills` lists [amount, ms] pairs. By default the bet fills in full when
  // it is placed, as a market order does. Pass null for a row with no fill
  // history at all.
  const bet = (userId, ms, fields = {}) => {
    const amount = fields.amount ?? 10
    const fills =
      fields.fills === null
        ? null
        : (fields.fills ?? [[amount, ms]]).map(([fillAmount, fillMs]) => ({
            matchedBetId: null,
            amount: fillAmount,
            shares: fillAmount * 2,
            timestamp: T0 + fillMs,
          }))
    return db.query(
      'insert into contract_bets values ($1,$2,$3,$4,$5,$6,$7,$8)',
      [
        `bet-${++bets}`,
        userId,
        at(ms),
        amount,
        fields.shares ?? 20,
        fields.isApi ?? false,
        fields.isRedemption ?? false,
        fills === null ? null : { fills },
      ]
    )
  }
  return { press, signIn, account, bet }
}

const byKey = (rows) =>
  Object.fromEntries(rows.map((r) => [`${r.variant}/${r.first_surface}`, r]))

test('counts signups within the hour and bets within the day, per first press', async () => {
  const db = await database()
  const { press, signIn, account, bet } = seed(db)
  try {
    // Control, market page: signs up through the ticket's button, then bets.
    await press('c-signup-bet', 0, 'control', 'ticket')
    await account('u1', 10 * MINUTE, 'c-signup-bet')
    await bet('u1', 30 * MINUTE)

    // Control, market page: the account comes just too late to count.
    await press('c-late-signup', 0, 'control', 'ticket')
    await account('u2', HOUR, 'c-late-signup')
    await bet('u2', 2 * HOUR)

    // Control, market page: an account that already existed on this device.
    await account('u3', -5 * MINUTE, 'c-existing')
    await press('c-existing', 0, 'control', 'ticket')
    await bet('u3', 5 * MINUTE)

    // Control, market page: only bets that are funded, human and not payouts.
    await press('c-junk-bets', 0, 'control', 'ticket')
    await account('u4', MINUTE, 'c-junk-bets')
    await bet('u4', 2 * MINUTE, { isApi: true })
    await bet('u4', 3 * MINUTE, { isRedemption: true })
    await bet('u4', 4 * MINUTE, { amount: 0, fills: [] })
    await bet('u4', 5 * MINUTE, { shares: 0 })

    // Treatment, market page: the window opens and completes, bet a bit later.
    await press('t-signup-bet', 0, 'treatment', 'ticket')
    await signIn('t-signup-bet', 20 * SECOND, 'treatment', 'signed-in')
    await account('u5', 25 * SECOND, 't-signup-bet')
    await bet('u5', 23 * HOUR)

    // Treatment, market page: signs up, but the first bet is a day late.
    await press('t-late-bet', 0, 'treatment', 'ticket')
    await signIn('t-late-bet', 15 * SECOND, 'treatment', 'signed-in')
    await account('u6', 20 * SECOND, 't-late-bet')
    await bet('u6', DAY)

    // Treatment, market page: closes the window, and a late retry is ignored.
    await press('t-closed', 0, 'treatment', 'ticket')
    await signIn('t-closed', 16 * SECOND, 'treatment', 'not-completed')
    await signIn('t-closed', 2 * HOUR, 'treatment', 'signed-in')

    // Treatment, list row first; a later market page press does not move it.
    await press('t-row', 0, 'treatment', 'button')
    await signIn('t-row', 10 * SECOND, 'treatment', 'signed-in')
    await account('u7', 12 * SECOND, 't-row')
    await bet('u7', 3 * MINUTE)
    await press('t-row', 20 * MINUTE, 'treatment', 'ticket', { first: false })

    // Control, list row: sign-in opens there in both variants.
    await press('c-row', 0, 'control', 'button')
    await signIn('c-row', 9 * SECOND, 'control', 'not-completed')

    // Control, list row: the window sat open for two hours before it closed.
    await press('c-row-slow', 0, 'control', 'button')
    await signIn('c-row-slow', 2 * HOUR, 'control', 'not-completed')

    // Never part of the estimate: preview or local presses, and no device id.
    await press('preview', 0, 'control', 'ticket', { environment: 'preview' })
    await press('local', 0, 'control', 'ticket', { environment: 'local' })
    await press('', 0, 'control', 'ticket')

    // A device that has shown up in both variants is counted where it began.
    await press('t-conflict', 0, 'treatment', 'ticket')
    await press('t-conflict', 5 * MINUTE, 'control', 'ticket', {
      first: false,
    })

    const rows = byKey(await report(db))
    assert.deepEqual(Object.keys(rows).sort(), [
      'control/button',
      'control/ticket',
      'treatment/button',
      'treatment/ticket',
    ])
    assert.deepEqual(rows['control/ticket'], {
      variant: 'control',
      first_surface: 'ticket',
      devices: 4,
      mature_hour_devices: 4,
      sign_in_settled_1h: 0,
      sign_in_completed_1h: 0,
      signups_1h: 2,
      mature_day_devices: 4,
      activated_1d: 1,
      assignment_conflicts: 0,
    })
    assert.deepEqual(rows['treatment/ticket'], {
      variant: 'treatment',
      first_surface: 'ticket',
      devices: 4,
      mature_hour_devices: 4,
      sign_in_settled_1h: 3,
      sign_in_completed_1h: 2,
      signups_1h: 2,
      mature_day_devices: 4,
      activated_1d: 1,
      assignment_conflicts: 1,
    })
    assert.deepEqual(rows['treatment/button'], {
      variant: 'treatment',
      first_surface: 'button',
      devices: 1,
      mature_hour_devices: 1,
      sign_in_settled_1h: 1,
      sign_in_completed_1h: 1,
      signups_1h: 1,
      mature_day_devices: 1,
      activated_1d: 1,
      assignment_conflicts: 0,
    })
    assert.deepEqual(rows['control/button'], {
      variant: 'control',
      first_surface: 'button',
      devices: 2,
      mature_hour_devices: 2,
      sign_in_settled_1h: 1,
      sign_in_completed_1h: 0,
      signups_1h: 0,
      mature_day_devices: 2,
      activated_1d: 0,
      assignment_conflicts: 0,
    })
  } finally {
    await db.close()
  }
})

test('a device that used the QA override is left out whole, in either order', async () => {
  const db = await database()
  const { press, signIn, account, bet } = seed(db)
  try {
    // Ordinary control press, then QA forces treatment and signs up. The
    // signup must not land in control.
    await press('unforced-then-forced', 0, 'control', 'ticket')
    await press('unforced-then-forced', 2 * MINUTE, 'treatment', 'ticket', {
      first: false,
      forced: true,
    })
    await account('u1', 3 * MINUTE, 'unforced-then-forced')
    await bet('u1', 4 * MINUTE)

    // Forced from its very first press.
    await press('forced-first', 0, 'treatment', 'ticket', { forced: true })
    await signIn('forced-first', SECOND, 'treatment', 'signed-in', {
      forced: true,
    })
    await account('u2', 2 * SECOND, 'forced-first')
    await press('forced-first', HOUR, 'control', 'ticket', { first: false })

    // Only its sign-in result carries the flag.
    await press('forced-sign-in', 0, 'treatment', 'button')
    await signIn('forced-sign-in', SECOND, 'treatment', 'signed-in', {
      forced: true,
    })

    // An ordinary device, so the report is not simply empty.
    await press('plain', 0, 'control', 'ticket')
    await account('u3', MINUTE, 'plain')

    const rows = await report(db)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].variant, 'control')
    assert.equal(rows[0].devices, 1)
    assert.equal(rows[0].signups_1h, 1)
    assert.equal(rows[0].activated_1d, 0)
    assert.equal(rows[0].assignment_conflicts, 0)
  } finally {
    await db.close()
  }
})

test('a resting limit order counts from its first fill, not from when it was placed', async () => {
  const db = await database()
  const { press, account, bet } = seed(db)
  try {
    // Placed two hours in, first filled two days later.
    await press('late-fill', 0, 'treatment', 'ticket')
    await account('u1', MINUTE, 'late-fill')
    await bet('u1', 2 * HOUR, { fills: [[10, 2 * DAY]] })

    // Placed two hours in, part filled within the day, the rest much later.
    await press('early-fill', 0, 'treatment', 'ticket')
    await account('u2', MINUTE, 'early-fill')
    await bet('u2', 2 * HOUR, {
      fills: [
        [4, 20 * HOUR],
        [6, 3 * DAY],
      ],
    })

    // Its only early entry in the fill history moved no money.
    await press('empty-fill', 0, 'treatment', 'ticket')
    await account('u3', MINUTE, 'empty-fill')
    await bet('u3', 2 * HOUR, {
      fills: [
        [0, 2 * HOUR],
        [10, 2 * DAY],
      ],
    })

    // A row with no fill history falls back to when it was placed.
    await press('no-history', 0, 'treatment', 'ticket')
    await account('u4', MINUTE, 'no-history')
    await bet('u4', 2 * HOUR, { fills: null })

    const [row] = await report(db)
    assert.equal(row.devices, 4)
    assert.equal(row.signups_1h, 4)
    // early-fill and no-history.
    assert.equal(row.activated_1d, 2)
  } finally {
    await db.close()
  }
})

test('outcomes wait until a device has had the full window', async () => {
  const db = await database()
  const { press, account, bet } = seed(db)
  try {
    await press('fresh', 0, 'treatment', 'ticket')
    await account('u1', MINUTE, 'fresh')
    await bet('u1', 2 * MINUTE)

    // Thirty minutes after the press: counted as a device, nothing more.
    let [row] = await report(db, args(START, END, at(30 * MINUTE)))
    assert.equal(row.devices, 1)
    assert.equal(row.mature_hour_devices, 0)
    assert.equal(row.signups_1h, 0)
    assert.equal(row.mature_day_devices, 0)
    assert.equal(row.activated_1d, 0)

    // An hour after: the signup counts, the bet does not yet.
    ;[row] = await report(db, args(START, END, at(HOUR)))
    assert.equal(row.mature_hour_devices, 1)
    assert.equal(row.signups_1h, 1)
    assert.equal(row.mature_day_devices, 0)
    assert.equal(row.activated_1d, 0)

    // A day after: both.
    ;[row] = await report(db, args(START, END, at(DAY)))
    assert.equal(row.signups_1h, 1)
    assert.equal(row.mature_day_devices, 1)
    assert.equal(row.activated_1d, 1)
  } finally {
    await db.close()
  }
})

test('a device enters by its first press only, whenever the window is', async () => {
  const db = await database()
  const { press, signIn, account, bet } = seed(db)
  try {
    // First pressed before the window, pressed again inside it.
    await press('early', -2 * DAY, 'control', 'ticket')
    await press('early', 0, 'control', 'ticket', { first: false })
    await account('u1', MINUTE, 'early')
    await press('inside', 0, 'control', 'ticket')
    // Two tabs pressing at the same moment can both log a first exposure.
    // The device still enters once, by the earlier of the two.
    await press('two-tabs', 0, 'treatment', 'ticket')
    await press('two-tabs', SECOND, 'treatment', 'button')
    // Pressed after the window closed.
    await press('after', 6 * DAY, 'control', 'ticket')
    // First pressed in the window's last minutes: its outcomes fall in the
    // day after the window, which is still read.
    const lastMinutes = Date.parse(END) - T0 - 10 * MINUTE
    await press('last-minutes', lastMinutes, 'treatment', 'button')
    await signIn(
      'last-minutes',
      lastMinutes + 5 * SECOND,
      'treatment',
      'signed-in'
    )
    await account('u2', lastMinutes + 20 * MINUTE, 'last-minutes')
    await bet('u2', lastMinutes + 5 * HOUR)

    const rows = byKey(await report(db))
    assert.deepEqual(Object.keys(rows).sort(), [
      'control/ticket',
      'treatment/button',
      'treatment/ticket',
    ])
    assert.equal(rows['treatment/ticket'].devices, 1)
    // 'inside' only: 'early' entered before the window and 'after' after it.
    assert.equal(rows['control/ticket'].devices, 1)
    assert.equal(rows['control/ticket'].signups_1h, 0)
    assert.equal(rows['treatment/button'].devices, 1)
    assert.equal(rows['treatment/button'].sign_in_completed_1h, 1)
    assert.equal(rows['treatment/button'].signups_1h, 1)
    assert.equal(rows['treatment/button'].activated_1d, 1)

    // A window that starts earlier picks 'early' up at its true first press,
    // where the account made two days later is outside the hour.
    const earlier = byKey(
      await report(db, args('2026-12-01T00:00:00Z', END, AS_OF))
    )
    assert.equal(earlier['control/ticket'].devices, 2)
    assert.equal(earlier['control/ticket'].signups_1h, 0)
  } finally {
    await db.close()
  }
})

test('only the cohort window and the day after it are read', async () => {
  const db = await database()
  const { press } = seed(db)
  try {
    await db.query(
      `insert into user_events (ts, name, data)
      select $1::timestamptz + n * interval '1 minute', $2,
        jsonb_build_object('deviceId', 'device-' || n, 'variant',
          case when n % 2 = 0 then 'control' else 'treatment' end,
          'surface', 'ticket', 'first', true, 'forced', false,
          'environment', 'production')
      from generate_series(1, 3000) n`,
      [START, rules.SIGNED_OUT_BET_TEST]
    )
    // Long after the window: must not be scanned, let alone counted.
    await press('much-later', 20 * DAY, 'control', 'ticket')
    await db.exec(`insert into user_events (ts, name, data)
      select '2026-09-01'::timestamptz + n * interval '1 second', 'background', '{}'::jsonb from generate_series(1, 100000) n;
      analyze;`)
    const rows = await report(db, args(START, END, '2027-01-15T00:00:00Z'))
    assert.equal(rows.length, 2)
    for (const row of rows) assert.equal(row.devices, 1500)

    const explained = await report(
      db,
      args(START, END, '2027-01-15T00:00:00Z'),
      true
    )
    let eventScans = 0
    let rowsRead
    const check = (node) => {
      if (node['Node Type'] === 'CTE Scan' && node['CTE Name'] === 'events') {
        eventScans++
        assert.ok(
          node['Actual Loops'] <= 1,
          'event CTE must not be rescanned per device'
        )
      }
      if (
        node['Relation Name'] === 'user_events' &&
        node['Actual Rows'] !== undefined
      )
        rowsRead = node['Actual Rows']
      for (const child of node.Plans ?? []) check(child)
    }
    check(explained[0]['QUERY PLAN'][0].Plan)
    assert.ok(eventScans > 0)
    // The 3,000 presses in the window; not the later press or the backlog.
    assert.equal(rowsRead, 3000)
  } finally {
    await db.close()
  }
})

test('report CLI validates its arguments and prints the rows with rates', async () => {
  const db = await database()
  const { press, account, bet } = seed(db)
  await press('d1', 0, 'treatment', 'ticket')
  await account('u1', MINUTE, 'd1')
  await bet('u1', 2 * MINUTE)
  await press('d2', 0, 'control', 'ticket')

  const run = (argv, env) => {
    let finish
    const done = new Promise((resolve) => (finish = resolve))
    const out = { logs: [], error: undefined, rows: undefined }
    const pgp = Object.assign(
      () => ({
        tx: (_mode, callback) =>
          callback({
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
      'backend/scripts/signed-out-bet-report.ts',
      { 'common/signed-out-bet': rules, fs, path, 'pg-promise': () => pgp },
      {
        __dirname: path.join(__dirname, '..'),
        Date: class extends Date {
          constructor(value) {
            super(value ?? AS_OF)
          }
        },
        process: { argv: ['node', 'signed-out-bet-report.ts', ...argv], env },
        console: {
          log: (...parts) => out.logs.push(parts),
          table: (value) => (out.rows = value),
          error: (...parts) => (out.error = new Error(parts.join(' '))),
        },
      }
    )
    return done.then(() => out)
  }
  const env = {
    SIGNED_OUT_BET_REPORT_DATABASE_URL: 'postgres://unused/report',
  }

  try {
    const out = await run(['2026-12-02', '2026-12-09'], env)
    assert.equal(out.error, undefined)
    const rows = byKey(out.rows)
    assert.equal(rows['treatment/ticket'].signup_rate_1h, '100.00%')
    assert.equal(rows['treatment/ticket'].activation_rate_1d, '100.00%')
    assert.equal(rows['control/ticket'].signup_rate_1h, '0.00%')
    const ratio = out.logs.map((l) => l[0]).find((l) => l && l.control === 1)
    assert.equal(ratio.treatment, 1)
    assert.equal(ratio.sampleRatioChiSquare, 0)

    for (const argv of [
      [],
      ['2026-12-02', '2026-12-02'],
      ['2026-12-09', '2026-12-02'],
      ['2026-12-02', '2026-12-11'],
      ['2026-02-30'],
      ['12/02/2026'],
    ]) {
      assert.throws(() => run(argv, env), /Use two UTC dates/, String(argv))
    }
    assert.throws(
      () => run(['2026-12-02', '2026-12-09'], {}),
      /Set SIGNED_OUT_BET_REPORT_DATABASE_URL/
    )
  } finally {
    await db.close()
  }
})
