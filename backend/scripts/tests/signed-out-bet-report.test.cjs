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
  // An exposure, stored at `ms`. Like a browser, each device says on every
  // one where it first pressed and how long ago: here that is its earliest
  // press() call, unless a test says otherwise.
  const firstPress = new Map()
  const press = (deviceId, ms, variant, surface, extra = {}) => {
    if (!firstPress.has(deviceId)) firstPress.set(deviceId, { ms, surface })
    const first = firstPress.get(deviceId)
    return db.query(
      'insert into user_events (ts, name, data) values ($1,$2,$3)',
      [
        at(ms),
        rules.SIGNED_OUT_BET_TEST,
        {
          deviceId,
          variant,
          surface,
          firstSurface: first.surface,
          sinceFirstPressMs: ms - first.ms,
          forced: false,
          environment: 'production',
          assignmentUnit: 'device',
          location: surface === 'ticket' ? 'bet panel' : 'contract table',
          ...extra,
        },
      ]
    )
  }
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
  // history at all, or `data` to say exactly what the row holds.
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
        'data' in fields ? fields.data : fills === null ? null : { fills },
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
    await press('t-row', 20 * MINUTE, 'treatment', 'ticket')

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
    await press('t-conflict', 5 * MINUTE, 'control', 'ticket')

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
    await press('forced-first', 30 * MINUTE, 'control', 'ticket')

    // Only its sign-in result carries the flag.
    await press('forced-sign-in', 0, 'treatment', 'button')
    await signIn('forced-sign-in', SECOND, 'treatment', 'signed-in', {
      forced: true,
    })

    // Forced half an hour before its ordinary press: the forced exposure is
    // the one it would enroll by.
    await press('forced-just-before', -30 * MINUTE, 'treatment', 'ticket', {
      forced: true,
    })
    await press('forced-just-before', 0, 'treatment', 'ticket')

    // The forced press's exposure was lost, but its sign-in window's result
    // was stored. The device enrolls by the ordinary press half an hour on.
    await signIn(
      'forced-trace-before',
      -30 * MINUTE,
      'treatment',
      'not-completed',
      {
        forced: true,
      }
    )
    await press('forced-trace-before', 0, 'treatment', 'button', {
      sinceFirstPressMs: 31 * MINUTE,
    })

    // Its forced sign-in result was stored a second before the moment its
    // only exposure puts the press at: the exposure took longer to arrive.
    await signIn('forced-just-ahead', 0, 'treatment', 'not-completed', {
      forced: true,
    })
    await press('forced-just-ahead', 2 * SECOND, 'treatment', 'button', {
      sinceFirstPressMs: SECOND,
    })

    // The override came two days after it entered. The day its outcomes are
    // measured over was an ordinary visitor's, so it stays in.
    await press('forced-much-later', 0, 'control', 'ticket')
    await press('forced-much-later', 2 * DAY, 'treatment', 'ticket', {
      forced: true,
    })

    // An ordinary device, so the report is not simply empty.
    await press('plain', 0, 'control', 'ticket')
    await account('u3', MINUTE, 'plain')

    const rows = await report(db)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].variant, 'control')
    // 'plain' and 'forced-much-later'.
    assert.equal(rows[0].devices, 2)
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
    // Placed two hours in, first filled a day and a half after the press.
    await press('late-fill', 0, 'treatment', 'ticket')
    await account('u1', MINUTE, 'late-fill')
    await bet('u1', 2 * HOUR, { fills: [[10, 36 * HOUR]] })

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

test('a fill history that is missing, empty or broken neither stops the report nor credits a bet wrongly', async () => {
  const db = await database()
  const { press, account, bet } = seed(db)
  try {
    const stamp = (ms) => T0 + ms
    // Each case is its own device and its own report row: the data of its
    // one bet, placed two hours after the press, and whether that is a bet
    // within a day of the press.
    const cases = [
      ['no-data', null, true],
      ['no-history', {}, true],
      ['empty-history', { fills: [] }, true],
      ['history-is-text', { fills: 'oops' }, true],
      ['history-is-an-object', { fills: { amount: 10 } }, true],
      [
        'text-amount',
        { fills: [{ amount: 'oops', timestamp: stamp(3 * HOUR) }] },
        false,
      ],
      ['text-time', { fills: [{ amount: 10, timestamp: 'soon' }] }, false],
      ['no-time', { fills: [{ amount: 10 }] }, false],
      ['null-fill', { fills: [null] }, false],
      [
        'bad-then-good',
        {
          fills: [
            { amount: 'oops', timestamp: stamp(3 * HOUR) },
            { amount: 5, timestamp: stamp(4 * HOUR) },
          ],
        },
        true,
      ],
      [
        'bad-then-late',
        {
          fills: [{ amount: 10 }, { amount: 5, timestamp: stamp(2 * DAY) }],
        },
        false,
      ],
      // A fill stamped before its own order counts from when the order was
      // placed.
      [
        'backdated',
        { fills: [{ amount: 10, timestamp: stamp(-5 * HOUR) }] },
        true,
      ],
    ]
    for (const [name, data] of cases) {
      await press(name, 0, name, 'ticket')
      await account(`u-${name}`, MINUTE, name)
      await bet(`u-${name}`, 2 * HOUR, { data })
    }
    const rows = await report(db)
    assert.equal(rows.length, cases.length)
    for (const [name, , counts] of cases) {
      const row = rows.find((r) => r.variant === name)
      assert.equal(row.devices, 1, name)
      assert.equal(row.signups_1h, 1, name)
      assert.equal(row.activated_1d, counts ? 1 : 0, name)
    }
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
    await press('early', 0, 'control', 'ticket')
    await account('u1', MINUTE, 'early')
    // Its first exposure was lost; the press a minute later is the one that
    // was stored.
    await press('sent-again', MINUTE, 'control', 'ticket', {
      sinceFirstPressMs: MINUTE,
    })
    // Two tabs pressed a second either side of the window's start.
    const boundary = Date.parse(START) - T0
    await press('across-start', boundary - SECOND, 'control', 'button')
    await press('across-start', boundary + SECOND, 'control', 'ticket')
    await press('inside', 0, 'control', 'ticket')
    // Two tabs pressing a second apart each log an exposure. The device
    // enters once, by the earlier of the two.
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
    // 'inside' and 'sent-again'. 'early' and 'across-start' entered before
    // the window, and 'after' after it.
    assert.equal(rows['control/ticket'].devices, 2)
    assert.equal(rows['control/ticket'].signups_1h, 0)
    assert.equal(rows['control/button'], undefined)
    assert.equal(rows['treatment/button'].devices, 1)
    assert.equal(rows['treatment/button'].sign_in_completed_1h, 1)
    assert.equal(rows['treatment/button'].signups_1h, 1)
    assert.equal(rows['treatment/button'].activated_1d, 1)

    // A window that starts earlier picks 'early' up at its true first press,
    // where the account made two days later is outside the hour.
    const earlier = byKey(
      await report(db, args('2026-12-01T00:00:00Z', END, AS_OF))
    )
    assert.equal(earlier['control/ticket'].devices, 3)
    assert.equal(earlier['control/ticket'].signups_1h, 0)
    // 'across-start', once, by its earlier exposure.
    assert.equal(earlier['control/button'].devices, 1)
  } finally {
    await db.close()
  }
})

test('an exposure enrolls its device only if it was sent within an hour of the first press', async () => {
  const db = await database()
  const { press } = seed(db)
  try {
    // The first exposure was lost and the visitor came back three days
    // later: too late to say that is where the device began.
    await press('back-days-later', 0, 'control', 'ticket', {
      sinceFirstPressMs: 3 * DAY,
    })
    // An hour and a second after the first press is too late. Exactly an
    // hour, and 59 minutes, are in time.
    await press('just-late', 0, 'control', 'button', {
      sinceFirstPressMs: HOUR + SECOND,
    })
    await press('on-the-hour', 0, 'treatment', 'ticket', {
      sinceFirstPressMs: HOUR,
    })
    await press('just-in-time', 0, 'treatment', 'ticket', {
      sinceFirstPressMs: 59 * MINUTE,
    })
    // A browser whose record could not be read, or whose clock went
    // backwards, says nothing about its enrollment.
    await press('says-nothing', 0, 'control', 'button', {
      sinceFirstPressMs: undefined,
      firstSurface: undefined,
    })
    // Anyone can write an event. An elapsed time that is negative, missing
    // or not a number never enrolls and never breaks the report. Nor does a
    // first surface that is not one.
    for (const [device, fields] of [
      ['negative', { sinceFirstPressMs: -1 }],
      ['null-time', { sinceFirstPressMs: null }],
      ['text-time', { sinceFirstPressMs: 'soon' }],
      ['digits-time', { sinceFirstPressMs: '0' }],
      ['huge-time', { sinceFirstPressMs: 1e300 }],
      ['no-surface', { firstSurface: undefined }],
      ['odd-surface', { firstSurface: 'page' }],
    ])
      await press(device, 0, 'control', 'button', fields)
    // Back within the hour on another page: one device, where it began.
    await press('back-soon', 0, 'treatment', 'ticket')
    await press('back-soon', 40 * MINUTE, 'treatment', 'button')

    const rows = byKey(await report(db))
    assert.deepEqual(Object.keys(rows), ['treatment/ticket'])
    // 'on-the-hour', 'just-in-time' and 'back-soon'.
    assert.equal(rows['treatment/ticket'].devices, 3)
  } finally {
    await db.close()
  }
})

test('a device is placed at its press and counted from there, however late its exposure arrives', async () => {
  const db = await database()
  const { press, signIn, account, bet } = seed(db)
  try {
    // All of these pressed at noon. This one's exposure could not be stored
    // until forty seconds later, by which time the account already existed.
    await press('held-up', 40 * SECOND, 'treatment', 'ticket', {
      sinceFirstPressMs: 40 * SECOND,
    })
    await account('u1', 20 * SECOND, 'held-up')
    await bet('u1', 30 * MINUTE)
    // Stored five minutes after the press. The account came 61 minutes
    // after the press: inside an hour of the stored event, but too late.
    await press('slow-signup', 5 * MINUTE, 'treatment', 'ticket', {
      sinceFirstPressMs: 5 * MINUTE,
    })
    await account('u2', 61 * MINUTE, 'slow-signup')
    // Stored fifty minutes after the press. Its bet filled a day and ten
    // minutes after the press: inside a day of the stored event, too late.
    await press('slow-bet', 50 * MINUTE, 'treatment', 'ticket', {
      sinceFirstPressMs: 50 * MINUTE,
    })
    await account('u3', 51 * MINUTE, 'slow-bet')
    await bet('u3', DAY + 10 * MINUTE)
    // Stored fifty minutes after the press. Its sign-in window closed 65
    // minutes after the press: inside an hour of the stored event, too late.
    await press('slow-window', 50 * MINUTE, 'treatment', 'ticket', {
      sinceFirstPressMs: 50 * MINUTE,
    })
    await signIn('slow-window', 65 * MINUTE, 'treatment', 'not-completed')
    // Its first press, on a market page, could not be stored. What was
    // stored came from a list row five minutes later, and says where the
    // device began.
    await press('began-elsewhere', 5 * MINUTE, 'treatment', 'button', {
      firstSurface: 'ticket',
      sinceFirstPressMs: 5 * MINUTE,
    })

    const rows = await report(db)
    assert.equal(rows.length, 1)
    const [row] = rows
    assert.equal(row.first_surface, 'ticket')
    assert.equal(row.devices, 5)
    assert.equal(row.signups_1h, 2)
    assert.equal(row.activated_1d, 1)
    assert.equal(row.sign_in_settled_1h, 0)

    // The windows a device must have had are measured from the press too.
    let [early] = await report(db, args(START, END, at(59 * MINUTE)))
    assert.equal(early.devices, 5)
    assert.equal(early.mature_hour_devices, 0)
    ;[early] = await report(db, args(START, END, at(HOUR)))
    assert.equal(early.mature_hour_devices, 5)
    assert.equal(early.signups_1h, 2)
    assert.equal(early.mature_day_devices, 0)
  } finally {
    await db.close()
  }
})

test('reports over adjacent windows add up to the report over both', async () => {
  const db = await database()
  const { press, signIn, account, bet } = seed(db)
  const FIRST = '2026-12-01T00:00:00Z'
  const SECOND_DAY = '2026-12-02T00:00:00Z'
  const THIRD = '2026-12-03T00:00:00Z'
  // Offsets from the boundary between the two windows.
  const b = Date.parse(SECOND_DAY) - T0
  try {
    await press('first-day', b - 6 * HOUR, 'control', 'ticket')
    await account('u1', b - 6 * HOUR + 10 * MINUTE, 'first-day')
    await bet('u1', b - 6 * HOUR + 30 * MINUTE)

    await press('second-day', b + 6 * HOUR, 'treatment', 'ticket')
    await signIn(
      'second-day',
      b + 6 * HOUR + 20 * SECOND,
      'treatment',
      'signed-in'
    )
    await account('u2', b + 6 * HOUR + 25 * SECOND, 'second-day')
    await bet('u2', b + 8 * HOUR)

    // Two tabs pressed a second either side of the boundary.
    await press('two-tabs', b - SECOND, 'control', 'button')
    await press('two-tabs', b + SECOND, 'control', 'ticket')

    // Pressed ten minutes before the boundary, which could not be stored.
    // What was stored came ten minutes after the boundary, and says so.
    await press('sent-again', b + 10 * MINUTE, 'treatment', 'button', {
      sinceFirstPressMs: 20 * MINUTE,
    })
    await account('u3', b + 12 * MINUTE, 'sent-again')

    // Pressed three hours before the boundary, and again five hours after.
    await press('back-later', b - 3 * HOUR, 'control', 'button')
    await press('back-later', b + 5 * HOUR, 'control', 'ticket')

    // Pressed thirty seconds before the boundary, stored thirty after it.
    await press('held-up', b + 30 * SECOND, 'control', 'ticket', {
      sinceFirstPressMs: MINUTE,
    })
    // Two exposures that can each enroll it, either side of the boundary.
    await press('two-copies', b - 50 * MINUTE, 'control', 'ticket')
    await press('two-copies', b + 5 * MINUTE, 'control', 'button')
    // Two tabs each wrote their own record of the first press, a second
    // and a half apart and either side of the boundary. The earlier
    // exposure decides, though the later one says the second day.
    await press('two-records', b - SECOND, 'control', 'button')
    await press('two-records', b + SECOND, 'control', 'ticket', {
      firstSurface: 'ticket',
      sinceFirstPressMs: SECOND / 2,
    })
    // Its first exposure is just outside what the second day's report
    // reads. The one inside still says the device began on the first day.
    await press('before-the-look-back', b - 61 * MINUTE, 'control', 'ticket')
    await press('before-the-look-back', b - 2 * MINUTE, 'control', 'ticket')

    // QA override a day and a half after it entered: stays in, everywhere.
    await press('forced-later', b - 2 * HOUR, 'control', 'ticket')
    await press('forced-later', b + 34 * HOUR, 'treatment', 'ticket', {
      forced: true,
    })
    // QA override six hours after it entered: left out, everywhere.
    await press('forced-soon', b - HOUR, 'treatment', 'ticket')
    await press('forced-soon', b + 5 * HOUR, 'control', 'ticket', {
      forced: true,
    })

    // Entered in the first day's last minutes; everything after is on the
    // second day.
    await press('last-minutes', b - 5 * MINUTE, 'treatment', 'button')
    await signIn(
      'last-minutes',
      b - 5 * MINUTE + 5 * SECOND,
      'treatment',
      'signed-in'
    )
    await account('u4', b + 10 * MINUTE, 'last-minutes')
    await bet('u4', b + 5 * HOUR)

    // The other variant shows up an hour after entering, and for another
    // device more than a day after.
    await press('soon-conflict', b - 2 * HOUR, 'control', 'ticket')
    await press('soon-conflict', b - HOUR, 'treatment', 'ticket')
    await press('late-conflict', b - 2 * HOUR, 'control', 'ticket')
    await press('late-conflict', b + 30 * HOUR, 'treatment', 'ticket')

    // Its sign-in window settled on the far side of the boundary.
    await press('slow-sign-in', b - 30 * MINUTE, 'control', 'button')
    await signIn('slow-sign-in', b + 20 * MINUTE, 'control', 'not-completed')

    // Never enrolls, in any window.
    await press('late-copy-only', b + 3 * HOUR, 'control', 'ticket', {
      sinceFirstPressMs: 3 * DAY,
    })

    const first = byKey(await report(db, args(FIRST, SECOND_DAY, AS_OF)))
    const second = byKey(await report(db, args(SECOND_DAY, THIRD, AS_OF)))
    const both = byKey(await report(db, args(FIRST, THIRD, AS_OF)))
    const columns = [
      'devices',
      'mature_hour_devices',
      'sign_in_settled_1h',
      'sign_in_completed_1h',
      'signups_1h',
      'mature_day_devices',
      'activated_1d',
      'assignment_conflicts',
    ]
    const keys = [
      'control/button',
      'control/ticket',
      'treatment/button',
      'treatment/ticket',
    ]
    assert.deepEqual(Object.keys(both).sort(), keys)
    for (const key of keys) {
      for (const column of columns) {
        assert.equal(
          (first[key]?.[column] ?? 0) + (second[key]?.[column] ?? 0),
          both[key][column],
          `${key} ${column}`
        )
      }
    }

    // And the parts are what they should be, not merely consistent.
    // first-day, held-up, two-copies, before-the-look-back, forced-later,
    // soon-conflict, late-conflict.
    assert.equal(first['control/ticket'].devices, 7)
    assert.equal(first['control/ticket'].signups_1h, 1)
    assert.equal(first['control/ticket'].activated_1d, 1)
    assert.equal(first['control/ticket'].assignment_conflicts, 1)
    // two-tabs, two-records, back-later, slow-sign-in.
    assert.equal(first['control/button'].devices, 4)
    assert.equal(first['control/button'].sign_in_settled_1h, 1)
    // last-minutes and sent-again, each with its account.
    assert.equal(first['treatment/button'].devices, 2)
    assert.equal(first['treatment/button'].sign_in_completed_1h, 1)
    assert.equal(first['treatment/button'].signups_1h, 2)
    assert.equal(first['treatment/button'].activated_1d, 1)
    assert.equal(first['treatment/ticket'], undefined)
    // Only second-day began on the second day.
    assert.deepEqual(Object.keys(second), ['treatment/ticket'])
    assert.equal(second['treatment/ticket'].devices, 1)
    assert.equal(second['treatment/ticket'].activated_1d, 1)
  } finally {
    await db.close()
  }
})

test('only the cohort window, the hour before it and the day after it are read', async () => {
  const db = await database()
  const { press } = seed(db)
  try {
    await db.query(
      `insert into user_events (ts, name, data)
      select $1::timestamptz + n * interval '1 minute', $2,
        jsonb_build_object('deviceId', 'device-' || n, 'variant',
          case when n % 2 = 0 then 'control' else 'treatment' end,
          'surface', 'ticket', 'forced', false,
          'firstSurface', 'ticket', 'sinceFirstPressMs', 0,
          'environment', 'production')
      from generate_series(1, 3000) n`,
      [START, rules.SIGNED_OUT_BET_TEST]
    )
    // Long after the window, and ninety minutes before it: must not be
    // scanned, let alone counted.
    await press('much-later', 20 * DAY, 'control', 'ticket')
    await press(
      'much-earlier',
      Date.parse(START) - T0 - 90 * MINUTE,
      'control',
      'ticket'
    )
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
    let rowsDiscarded
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
      ) {
        rowsRead = node['Actual Rows']
        rowsDiscarded = node['Rows Removed by Filter'] ?? 0
      }
      for (const child of node.Plans ?? []) check(child)
    }
    check(explained[0]['QUERY PLAN'][0].Plan)
    assert.ok(eventScans > 0)
    // The 3,000 presses in the window; not the earlier or later press.
    assert.equal(rowsRead, 3000)
    // And the 100,000 older events were not read and thrown away: the time
    // bounds are what the table is read by.
    assert.equal(rowsDiscarded, 0)
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
  await press('d3', 0, 'control', 'button')
  await press('d4', 0, 'control', 'button')
  await press('d5', 0, 'control', 'button')
  await press('d6', 0, 'treatment', 'button')
  // Two days on: the range is read a day at a time and added up.
  await press('d7', 2 * DAY, 'control', 'ticket')

  const run = (argv, env) => {
    let finish
    const done = new Promise((resolve) => (finish = resolve))
    const out = { logs: [], error: undefined, rows: undefined, windows: [] }
    const pgp = Object.assign(
      () => ({
        tx: (_mode, callback) =>
          callback({
            none: async () => {},
            manyOrNone: (query, parameters) => {
              assert.equal(query, sql)
              out.windows.push(parameters.slice(0, 2))
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
    // One query for each UTC day of the range, end to end.
    assert.equal(out.windows.length, 7)
    assert.equal(out.windows[0][0], '2026-12-02T00:00:00.000Z')
    assert.equal(out.windows.at(-1)[1], '2026-12-09T00:00:00.000Z')
    out.windows.forEach(([from, to], i) => {
      assert.equal(Date.parse(to) - Date.parse(from), DAY)
      if (i) assert.equal(from, out.windows[i - 1][1])
    })
    const rows = byKey(out.rows)
    assert.deepEqual(Object.keys(rows), [
      'control/button',
      'control/ticket',
      'treatment/button',
      'treatment/ticket',
    ])
    assert.equal(rows['treatment/ticket'].signup_rate_1h, '100.00%')
    assert.equal(rows['treatment/ticket'].activation_rate_1d, '100.00%')
    assert.equal(rows['control/ticket'].signup_rate_1h, '0.00%')
    // d2 on the 3rd and d7 on the 5th.
    assert.equal(rows['control/ticket'].devices, 2)
    assert.equal(rows['control/ticket'].mature_day_devices, 2)
    // The split is checked overall and for each first surface.
    assert.deepEqual(
      // Made in the script's own context, so compared by value.
      JSON.parse(
        JSON.stringify(
          out.logs.map((l) => l[0]).filter((l) => l && l.firstSurface)
        )
      ),
      [
        {
          firstSurface: 'all',
          control: 5,
          treatment: 2,
          sampleRatioChiSquare: 9 / 7,
        },
        {
          firstSurface: 'ticket',
          control: 2,
          treatment: 1,
          sampleRatioChiSquare: 1 / 3,
        },
        {
          firstSurface: 'button',
          control: 3,
          treatment: 1,
          sampleRatioChiSquare: 1,
        },
      ]
    )

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
