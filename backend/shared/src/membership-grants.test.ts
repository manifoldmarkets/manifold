import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
import { join } from 'path'
import * as pgPromise from 'pg-promise'
import { adminGrantMembershipDays } from 'api/admin-grant-membership-days'
import { getMembershipGrants } from 'api/get-membership-grants'
import { ENV_CONFIG } from 'common/envs/constants'
import { shopPurchase } from 'api/shop-purchase'
import { shopCancelSubscription } from 'api/shop-cancel-subscription'
import { processMembershipRenewals } from 'scheduler/jobs/process-membership-renewals'
import { processMembershipGrants } from 'scheduler/jobs/process-membership-grants'
import { checkSubscriptionExpiry } from 'scheduler/jobs/check-subscription-expiry'
import { createPushNotifications } from './create-push-notifications'
import { getNotifications } from 'api/get-notifications'
import { getShopStats } from 'api/get-shop-stats'
import { getNotificationDestinationsForUser } from 'common/user-notification-preferences'
import {
  getSupporterEntitlement,
  SUPPORTER_TIERS,
  wasEverSupporter,
} from 'common/supporter-config'
import {
  freeDaysExpiryMessage,
  MembershipSubscriptionData,
} from 'common/notification'
import { membershipGrantLockMessage } from 'common/membership-grants'
import { DAY_MS, HOUR_MS } from 'common/util/time'
import {
  grantMembershipDays,
  processUserMembershipGrants,
} from './membership-grants'
import { getSupporterRow } from './supabase/entitlements'
import {
  createSupabaseDirectClient,
  SERIAL_MODE,
  SupabaseDirectClientTimeout,
  SupabaseTransaction,
} from './supabase/init'
import { broadcastUpdatedUser } from './websockets/helpers'
import { broadcast } from './websockets/server'

jest.mock('./websockets/helpers', () => ({ broadcastUpdatedUser: jest.fn() }))
jest.mock('./supabase/init', () => ({
  pgp: jest.requireActual('pg-promise')(),
  SERIAL_MODE: { tiLevel: 'serializable' },
  createSupabaseDirectClient: jest.fn(),
}))
jest.mock('./monitoring/log', () => ({
  log: Object.assign(jest.fn(), { warn: jest.fn(), error: jest.fn() }),
}))
jest.mock('api/helpers/endpoint', () => ({
  APIError: jest.requireActual('common/api/utils').APIError,
}))
jest.mock('shared/utils', () => ({
  log: jest.fn(),
  getPrivateUser: jest.fn(async () => ({ id: 'member' })),
  getUser: jest.fn(async () => ({ id: 'member', balance: 100000 })),
}))
jest.mock('shared/websockets/server', () => ({
  broadcast: jest.fn(),
}))
jest.mock('shared/create-push-notifications', () => ({
  createPushNotifications: jest.fn(),
}))
jest.mock('common/user-notification-preferences', () => ({
  getNotificationDestinationsForUser: jest.fn(() => ({
    sendToBrowser: true,
    sendToMobile: true,
  })),
}))
jest.mock('shared/helpers/fn-queue', () => ({
  betsQueue: { enqueueFn: (fn: () => unknown) => fn() },
}))

// Execute production SQL against the real migration. Match the direct client's
// text timestamps and int8 parser, and assert the retry wrapper's isolation level.
let db: PGlite
const pgp = pgPromise()
const rows = async (sql: string, params?: unknown) =>
  // A fresh PGlite instance connects to template1. Map the production database qualifier.
  (
    await db.query(
      pgp.as.format(sql.replace('postgres.public.', 'public.'), params)
    )
  ).rows
const tx = {
  manyOrNone: rows,
  async multi(sql: string) {
    return (await db.exec(sql)).map((result) => result.rows)
  },
  async map(sql: string, params: unknown, fn: (row: unknown) => unknown) {
    return (await rows(sql, params)).map(fn)
  },
  async oneOrNone(sql: string, params?: unknown) {
    const result = await rows(sql, params)
    if (result.length > 1) throw new Error('Expected at most one row')
    return result[0] ?? null
  },
  async one(sql: string, params?: unknown) {
    const result = await rows(sql, params)
    if (result.length !== 1) throw new Error('Expected one row')
    return result[0]
  },
  async none(sql: string, params?: unknown) {
    expect(await rows(sql, params)).toHaveLength(0)
  },
}
const testClient = {
  ...tx,
  async tx(options: { mode: unknown }, fn: (t: typeof tx) => Promise<unknown>) {
    expect(options.mode).toBe(SERIAL_MODE)
    await db.exec('begin isolation level serializable')
    try {
      const result = await fn(tx)
      await db.exec('commit')
      return result
    } catch (err) {
      await db.exec('rollback')
      throw err
    }
  },
}
const pg = testClient as unknown as SupabaseDirectClientTimeout
const userId = 'member'
const input = {
  userId,
  tier: 'plus' as const,
  durationMs: 3 * DAY_MS,
  source: 'trophy',
  sourceId: 'whale',
}
type Handler = (
  props: Record<string, string>,
  auth: { uid: string }
) => Promise<unknown>
const purchase = shopPurchase as Handler
const cancel = shopCancelSubscription as Handler
const supporter = () =>
  getSupporterRow(tx as unknown as SupabaseTransaction, userId)
const originalStartsDisabled = process.env.MEMBERSHIP_GRANT_STARTS_DISABLED

beforeAll(async () => {
  db = new PGlite({
    parsers: { 1184: (v: string) => v, 20: Number },
  })
  await db.exec(`create table users(id text primary key, balance integer default 100000, cash_balance integer default 0, total_deposits integer default 100000, total_cash_deposits integer default 0);
 create table txns(id bigint generated always as identity primary key, created_time timestamptz default now(), amount integer, from_id text, from_type text, to_id text, to_type text, token text, category text, data jsonb);
 create table shop_orders(user_id text, item_id text, price_mana integer, txn_id bigint, status text, quantity integer default 1, created_time timestamptz default now());
 create table user_notifications(user_id text, notification_id text, data jsonb, primary key(user_id,notification_id));
 create table user_entitlements(user_id text, entitlement_id text, granted_time timestamptz not null default now(), expires_time timestamptz, enabled boolean default true, auto_renew boolean default false, metadata jsonb, primary key(user_id,entitlement_id));
 insert into users values ('member');`)
  const migration = readFileSync(
    join(
      __dirname,
      '../../supabase/migrations/2026112503_membership_grants.sql'
    ),
    'utf8'
  )
  await db.exec(migration)
  await db.exec(
    `create role anon; create role authenticated;
     grant all on membership_grants, membership_notice_deliveries to anon, authenticated;
     grant all on sequence membership_grants_id_seq to anon, authenticated`
  )
  await db.exec(migration)
  expect(
    await rows(`select grantee from information_schema.role_table_grants where
    table_name in ('membership_grants','membership_notice_deliveries') and grantee in ('anon','authenticated')`)
  ).toEqual([])
  expect(
    await rows(`select rolname from pg_roles where rolname in ('anon','authenticated')
      and has_sequence_privilege(rolname, 'membership_grants_id_seq', 'SELECT, USAGE, UPDATE')`)
  ).toEqual([])
  expect(
    await rows(
      "select relrowsecurity from pg_class where oid = 'membership_notice_deliveries'::regclass"
    )
  ).toEqual([{ relrowsecurity: true }])
  jest.mocked(createSupabaseDirectClient).mockReturnValue(pg)
}, 30000)
beforeEach(async () => {
  delete process.env.MEMBERSHIP_GRANT_STARTS_DISABLED
  jest.clearAllMocks()
  await db.exec(
    'truncate membership_grants, membership_notice_deliveries, user_entitlements, txns, shop_orders, user_notifications; update users set balance = 100000, total_deposits = 100000'
  )
})
afterEach(() => {
  if (originalStartsDisabled === undefined)
    delete process.env.MEMBERSHIP_GRANT_STARTS_DISABLED
  else process.env.MEMBERSHIP_GRANT_STARTS_DISABLED = originalStartsDisabled
  jest.useRealTimers()
  jest.restoreAllMocks()
})
afterAll(async () => {
  await db.close()
})

it('locks checkout, cancels only the waiting renewal, chains grants and preserves paid milliseconds', async () => {
  const now = Date.now()
  const clock = jest.spyOn(Date, 'now').mockReturnValue(now)
  const remainingMs = DAY_MS + 123
  await rows(
    `insert into user_entitlements(user_id,entitlement_id,granted_time,expires_time,auto_renew)
 values ($1,'supporter-basic',$2,$3,true)`,
    [userId, new Date(now - DAY_MS), new Date(now + remainingMs)]
  )
  const first = await grantMembershipDays(pg, input)
  expect(first).toMatchObject({
    outcome: 'started',
    grant: { pausedPaid: { tier: 'basic', remainingMs, autoRenew: true } },
  })
  expect((await supporter())?.metadata).toEqual({
    membershipGrantId: first.grant.id,
  })
  await expect(
    purchase({ itemId: 'supporter-premium' }, { uid: userId })
  ).rejects.toMatchObject({
    code: 403,
    message: membershipGrantLockMessage('plus', now + input.durationMs),
  })
  await cancel({}, { uid: userId })
  const second = await grantMembershipDays(pg, {
    ...input,
    tier: 'basic',
    sourceId: 'second',
  })
  expect(second.outcome).toBe('banked')
  const end = first.grant.endsTime! + 1234
  clock.mockReturnValue(end)
  expect(await processUserMembershipGrants(pg, userId)).toEqual({
    ended: first.grant.id,
    started: second.grant.id,
  })
  expect((await supporter())?.metadata).toEqual({
    membershipGrantId: second.grant.id,
  })
  clock.mockReturnValue(end + input.durationMs + 456)
  expect((await processUserMembershipGrants(pg, userId)).ended).toBe(
    second.grant.id
  )
  expect(await supporter()).toMatchObject({
    entitlementId: 'supporter-basic',
    grantedTime: now - DAY_MS,
    expiresTime: Date.now() + remainingMs,
    autoRenew: false,
    metadata: undefined,
  })
  jest.mocked(broadcastUpdatedUser).mockClear()
  expect(await grantMembershipDays(pg, input)).toMatchObject({
    outcome: 'duplicate',
    grant: { id: first.grant.id, status: 'used' },
  })
  expect(await processUserMembershipGrants(pg, userId)).toEqual({
    ended: null,
    started: null,
  })
  expect(broadcastUpdatedUser).not.toHaveBeenCalled()
  expect(await rows('select id from membership_grants')).toHaveLength(2)
})

it('restores a former member’s lapsed row exactly after chained grants', async () => {
  const now = Date.UTC(2026, 10, 25)
  const clock = jest.spyOn(Date, 'now').mockReturnValue(now)
  await rows(
    `insert into user_entitlements(user_id, entitlement_id, granted_time, expires_time, enabled, auto_renew, metadata)
     values ($1,'supporter-premium','2026-09-01 12:00:00.123456+00','2026-10-01 12:00:00.654321+00',true,false,$2)`,
    [userId, { source: 'shop' }]
  )
  const original = await rows('select * from user_entitlements')
  const first = await grantMembershipDays(pg, input)
  expect(first.outcome).toBe('started')
  const second = await grantMembershipDays(pg, { ...input, sourceId: 'next' })
  clock.mockReturnValue(first.grant.endsTime! + HOUR_MS)
  expect((await processUserMembershipGrants(pg, userId)).started).toBe(
    second.grant.id
  )
  clock.mockReturnValue(Date.now() + input.durationMs + HOUR_MS)
  await processUserMembershipGrants(pg, userId)
  expect(await rows('select * from user_entitlements')).toEqual(original)
  const restored = await supporter()
  expect(wasEverSupporter(restored ? [restored] : [])).toBe(true)
  expect(getSupporterEntitlement(restored ? [restored] : [])).toBeNull()
  expect(await rows('select * from txns')).toEqual([])
})

it('removes a free-only row without offering a paid cancellation', async () => {
  const issued = await grantMembershipDays(pg, input)
  expect(issued.grant.pausedPaid).toBeNull()
  await expect(cancel({}, { uid: userId })).rejects.toMatchObject({
    code: 404,
    message: expect.stringContaining('no paid membership'),
  })
  jest.spyOn(Date, 'now').mockReturnValue(issued.grant.endsTime!)
  await processUserMembershipGrants(pg, userId)
  expect(await supporter()).toBeNull()
})

it('excludes a grant-owned row from mana renewals even with auto_renew set', async () => {
  await grantMembershipDays(pg, input)
  await rows(
    "update user_entitlements set auto_renew = true, expires_time = now() - interval '1 second'"
  )
  await processMembershipRenewals()
  expect(await rows('select * from txns')).toEqual([])
  expect((await supporter())?.autoRenew).toBe(true)
})

async function bankPlusBehindPremium(
  now: number,
  autoRenew: boolean,
  durationMs = input.durationMs
) {
  const expiry = now - 26 * HOUR_MS
  const clock = jest.spyOn(Date, 'now').mockReturnValue(expiry - DAY_MS)
  await rows(
    `insert into user_entitlements(user_id, entitlement_id, granted_time, expires_time, auto_renew)
     values ($1, 'supporter-premium', $2, $3, $4)`,
    [userId, new Date(expiry - 30 * DAY_MS), new Date(expiry), autoRenew]
  )
  const { outcome, grant } = await grantMembershipDays(pg, {
    ...input,
    tier: 'basic',
    durationMs,
  })
  expect(outcome).toBe('banked')
  clock.mockReturnValue(now)
  jest.mocked(broadcastUpdatedUser).mockClear()
  return { clock, grant }
}

it.each(['renewal first', 'grant first'])(
  'starts banked Plus before charging overdue Premium (%s)',
  async (order) => {
    const now = Date.now()
    const { clock, grant } = await bankPlusBehindPremium(now, true)
    const [first, second] =
      order === 'renewal first'
        ? [processMembershipRenewals, processMembershipGrants]
        : [processMembershipGrants, processMembershipRenewals]
    await first()
    expect(await supporter()).toMatchObject({
      entitlementId: 'supporter-basic',
      expiresTime: now + input.durationMs,
      metadata: { membershipGrantId: grant.id },
      autoRenew: false,
    })
    await second()
    expect(
      await rows('select status, paused_paid from membership_grants')
    ).toEqual([
      {
        status: 'active',
        paused_paid: expect.objectContaining({
          tier: 'premium',
          remainingMs: -26 * HOUR_MS,
          autoRenew: true,
        }),
      },
    ])
    expect(
      await rows('select balance from users where id = $1', [userId])
    ).toEqual([{ balance: 100000 }])
    expect(await rows('select * from txns')).toEqual([])
    expect(broadcastUpdatedUser).toHaveBeenCalledTimes(1)
    expect(createPushNotifications).toHaveBeenCalledTimes(1)
    expect(
      await rows(
        "select data->'data'->>'expiryReason' as reason from user_notifications"
      )
    ).toEqual([{ reason: 'free_days' }])

    clock.mockReturnValue(now + input.durationMs)
    await processUserMembershipGrants(pg, userId)
    await processMembershipRenewals()
    expect(await rows('select amount from txns')).toEqual([
      { amount: SUPPORTER_TIERS.premium.price },
    ])
    expect(await supporter()).toMatchObject({
      entitlementId: 'supporter-premium',
      autoRenew: true,
      expiresTime: Date.now() + 30 * DAY_MS,
    })
  }
)

it('commits banked Plus at checkout and returns the free-days lock without selling it', async () => {
  const now = Date.UTC(2026, 10, 25, 19)
  const { grant } = await bankPlusBehindPremium(now, false, 4 * HOUR_MS)
  const entitlements = [
    expect.objectContaining({
      entitlementId: 'supporter-basic',
      metadata: { membershipGrantId: grant.id },
      autoRenew: false,
      expiresTime: now + grant.durationMs,
    }),
  ]
  const lock = {
    code: 403,
    message: membershipGrantLockMessage('basic', now + grant.durationMs),
  }
  await expect(
    purchase({ itemId: 'supporter-basic' }, { uid: userId })
  ).rejects.toMatchObject(lock)
  await expect(
    purchase({ itemId: 'supporter-basic' }, { uid: userId })
  ).rejects.toMatchObject(lock)
  expect(await supporter()).toEqual(entitlements[0])
  expect(broadcastUpdatedUser).toHaveBeenCalledTimes(1)
  expect(broadcastUpdatedUser).toHaveBeenCalledWith({
    id: userId,
    entitlements,
  })
  expect(createPushNotifications).toHaveBeenCalledTimes(1)
  expect(
    await rows('select notice_key from membership_notice_deliveries')
  ).toHaveLength(1)
  expect(await rows('select * from shop_orders')).toEqual([])
  expect(await rows('select * from txns')).toEqual([])
  expect(
    await rows('select balance from users where id = $1', [userId])
  ).toEqual([{ balance: 100000 }])
  expect(await rows('select paused_paid from membership_grants')).toEqual([
    {
      paused_paid: expect.objectContaining({
        tier: 'premium',
        remainingMs: -26 * HOUR_MS,
        autoRenew: false,
      }),
    },
  ])
})

it.each([
  [23, 100000],
  [23, 0],
  [48, 100000],
  [0, 100000],
])(
  'settles a restored renewal %ih overdue immediately after the scan (balance %i)',
  async (hours, balance) => {
    const end = Date.now()
    const durationMs = 4 * DAY_MS
    const start = end - durationMs
    const clock = jest.spyOn(Date, 'now').mockReturnValue(start)
    const remainingMs = 0 - hours * HOUR_MS
    await rows('update users set balance = $1 where id = $2', [balance, userId])
    await rows(
      `insert into user_entitlements(user_id, entitlement_id, expires_time, auto_renew)
    values ($1,'supporter-plus',$2,true)`,
      [userId, new Date(start + remainingMs)]
    )
    const issued = await grantMembershipDays(pg, { ...input, durationMs })
    expect(issued.grant.pausedPaid).toMatchObject({
      remainingMs,
      autoRenew: true,
    })
    clock.mockReturnValue(end)
    await processMembershipRenewals()
    expect(await rows('select * from txns')).toHaveLength(0)
    expect(await processUserMembershipGrants(pg, userId)).toEqual({
      ended: issued.grant.id,
      started: null,
    })

    const price = SUPPORTER_TIERS.plus.price
    const funded = balance >= price
    const paid = await supporter()
    expect(paid).toMatchObject({
      entitlementId: 'supporter-plus',
      expiresTime: funded ? end + 30 * DAY_MS : end + remainingMs,
      autoRenew: funded,
      metadata: undefined,
    })
    expect(getSupporterEntitlement(paid ? [paid] : [], end)).toEqual(
      funded ? paid : null
    )
    expect(
      await rows("select data->'data'->>'type' as type from user_notifications")
    ).toEqual([{ type: funded ? 'renewed' : 'cancelled' }])
    expect(createPushNotifications).toHaveBeenCalledTimes(1)
    await processMembershipRenewals()
    await processUserMembershipGrants(pg, userId)
    expect(
      await rows('select balance from users where id = $1', [userId])
    ).toEqual([{ balance: funded ? balance - price : balance }])
    expect(await rows('select from_id, category, amount from txns')).toEqual(
      funded
        ? [{ from_id: userId, category: 'MEMBERSHIP_PAYMENT', amount: price }]
        : []
    )
    expect(createPushNotifications).toHaveBeenCalledTimes(1)
  }
)

it('cancels a paid renewal beyond the 25-hour access grace period', async () => {
  await rows(
    `insert into user_entitlements(user_id, entitlement_id, expires_time, auto_renew)
    values ($1,'supporter-basic',now() - interval '2 days',true)`,
    [userId]
  )
  await cancel({}, { uid: userId })
  await processMembershipRenewals()
  expect((await supporter())?.autoRenew).toBe(false)
  expect(await rows('select * from txns')).toEqual([])
})

it('publishes one debit and notice when a scheduled renewal retries after the debit', async () => {
  await rows(
    `insert into user_entitlements(user_id, entitlement_id, expires_time, auto_renew)
    values ($1,'supporter-plus',now() - interval '23 hours',true)`,
    [userId]
  )
  jest
    .spyOn(tx, 'none')
    .mockRejectedValueOnce(
      Object.assign(new Error('retry expiry update'), { code: '40001' })
    )
  await processMembershipRenewals()
  const price = SUPPORTER_TIERS.plus.price
  expect(await rows('select amount from txns')).toEqual([{ amount: price }])
  expect(broadcastUpdatedUser).toHaveBeenCalledTimes(1)
  expect(broadcastUpdatedUser).toHaveBeenCalledWith(
    expect.objectContaining({ balance: 100000 - price })
  )
  expect(createPushNotifications).toHaveBeenCalledTimes(1)
})

it('broadcasts the membership debit only for the committed checkout attempt', async () => {
  const insert = jest.spyOn(tx, 'none')
  insert.mockRejectedValueOnce(
    Object.assign(new Error('retry order insert'), { code: '40001' })
  )
  await purchase({ itemId: 'supporter-basic' }, { uid: userId })
  expect(await rows('select amount from txns')).toEqual([
    { amount: SUPPORTER_TIERS.basic.price },
  ])
  const debits = jest
    .mocked(broadcastUpdatedUser)
    .mock.calls.filter(([user]) => user.balance !== undefined)
  expect(debits).toHaveLength(1)
  expect(debits[0][0].balance).toBe(100000 - SUPPORTER_TIERS.basic.price)
})

it('ends early for rollback, restores paid time, and leaves banked grants untouched on retries', async () => {
  const now = Date.now()
  const clock = jest.spyOn(Date, 'now').mockReturnValue(now)
  await rows(
    `insert into user_entitlements(user_id, entitlement_id, expires_time, auto_renew)
    values ($1,'supporter-basic',$2,true)`,
    [userId, new Date(now + HOUR_MS)]
  )
  const active = await grantMembershipDays(pg, input)
  await grantMembershipDays(pg, { ...input, sourceId: 'next' })
  process.env.MEMBERSHIP_GRANT_STARTS_DISABLED = 'true'
  clock.mockReturnValue(now + DAY_MS)
  expect(await processUserMembershipGrants(pg, userId, 'end-active')).toEqual({
    ended: active.grant.id,
    started: null,
  })
  expect(await processUserMembershipGrants(pg, userId, 'end-active')).toEqual({
    ended: null,
    started: null,
  })
  await processMembershipGrants()
  expect(await supporter()).toMatchObject({
    entitlementId: 'supporter-basic',
    expiresTime: now + DAY_MS + HOUR_MS,
    autoRenew: true,
    metadata: undefined,
  })
  expect(await grantMembershipDays(pg, input)).toMatchObject({
    outcome: 'duplicate',
    grant: {
      id: active.grant.id,
      status: 'banked',
      durationMs: input.durationMs - DAY_MS,
      startedTime: null,
      endsTime: null,
      pausedPaid: null,
      endedTime: null,
      note: expect.stringContaining('Ended early'),
    },
  })
  expect(
    await rows('select status, duration_ms from membership_grants order by id')
  ).toEqual([
    { status: 'banked', duration_ms: input.durationMs - DAY_MS },
    { status: 'banked', duration_ms: input.durationMs },
  ])
})

it('keeps an eligible award banked through issuance, the ten-minute job and checkout while starts are disabled', async () => {
  process.env.MEMBERSHIP_GRANT_STARTS_DISABLED = 'true'
  expect(await grantMembershipDays(pg, input)).toMatchObject({
    outcome: 'banked',
  })
  await processMembershipGrants()
  expect(await supporter()).toBeNull()
  await purchase({ itemId: 'supporter-basic' }, { uid: userId })
  expect(await rows('select amount from txns')).toEqual([
    { amount: SUPPORTER_TIERS.basic.price },
  ])
  expect(await supporter()).toMatchObject({
    entitlementId: 'supporter-basic',
    autoRenew: true,
    metadata: undefined,
  })
  expect(await rows('select status from membership_grants')).toEqual([
    { status: 'banked' },
  ])
})

it('renews paid time with an eligible banked grant while starts are disabled', async () => {
  const now = Date.now()
  await bankPlusBehindPremium(now, true)
  process.env.MEMBERSHIP_GRANT_STARTS_DISABLED = 'true'
  await processMembershipRenewals()
  expect(await rows('select amount from txns')).toEqual([
    { amount: SUPPORTER_TIERS.premium.price },
  ])
  expect(await supporter()).toMatchObject({
    entitlementId: 'supporter-premium',
    expiresTime: now + 30 * DAY_MS,
  })
  expect(await rows('select status from membership_grants')).toEqual([
    { status: 'banked' },
  ])
})

it('locks active free time and restores paid time without chaining when starts are disabled', async () => {
  const end = Date.now() - HOUR_MS
  const start = end - input.durationMs
  const clock = jest.spyOn(Date, 'now').mockReturnValue(start)
  await rows(
    "insert into user_entitlements(user_id, entitlement_id, expires_time, auto_renew) values ($1, 'supporter-basic', $2, true)",
    [userId, new Date(start + DAY_MS)]
  )
  await grantMembershipDays(pg, input)
  process.env.MEMBERSHIP_GRANT_STARTS_DISABLED = 'true'
  await grantMembershipDays(pg, { ...input, sourceId: 'next' })
  await expect(
    purchase({ itemId: 'supporter-premium' }, { uid: userId })
  ).rejects.toMatchObject({
    code: 403,
    message: membershipGrantLockMessage('plus', end),
  })
  clock.mockReturnValue(end)
  await processMembershipGrants()
  expect(await supporter()).toMatchObject({
    entitlementId: 'supporter-basic',
    expiresTime: end + DAY_MS,
    metadata: undefined,
  })
  expect(
    await rows('select status from membership_grants order by id')
  ).toEqual([{ status: 'used' }, { status: 'banked' }])
})

it('shows the next banked Pro grant before paused paid Plus in the notice and owner view', async () => {
  const now = Date.now()
  const clock = jest.spyOn(Date, 'now').mockReturnValue(now)
  await rows(
    `insert into user_entitlements(user_id,entitlement_id,expires_time,auto_renew)
    values ($1,'supporter-basic',now()+interval '20 days',true)`,
    [userId]
  )
  await grantMembershipDays(pg, {
    ...input,
    tier: 'premium',
    durationMs: 4 * DAY_MS,
  })
  await grantMembershipDays(pg, { ...input, sourceId: 'banked-pro' })
  clock.mockReturnValue(now + DAY_MS)
  const next = { kind: 'free', tier: 'plus' }
  expect(
    await (getMembershipGrants as Handler)({}, { uid: userId })
  ).toMatchObject({ next })
  await expect(
    purchase({ itemId: 'supporter-basic' }, { uid: userId })
  ).rejects.toMatchObject({
    code: 403,
    message: expect.stringContaining(
      'then free Pro days start. You can change your membership once your free days end.'
    ),
  })
  await checkSubscriptionExpiry()
  expect(
    await rows(
      "select data->'data'->'nextMembership' as next from user_notifications"
    )
  ).toEqual([{ next }])
  expect(jest.mocked(createPushNotifications).mock.calls[0][0][0][3]).toContain(
    'banked free Pro days start next'
  )
})

it('counts free access separately from the paused paid tier and renewal choice', async () => {
  const stats = getShopStats as (p: { limitDays: number }) => Promise<unknown>
  await rows(
    `insert into user_entitlements(user_id,entitlement_id,expires_time,auto_renew)
    values ($1,'supporter-basic',now()+interval '20 days',true)`,
    [userId]
  )
  await grantMembershipDays(pg, { ...input, tier: 'premium' })
  await rows("insert into users (id) values ('free-only')")
  await grantMembershipDays(pg, { ...input, userId: 'free-only' })
  expect(await stats({ limitDays: 1 })).toMatchObject({
    freeDayMembers: 2,
    subscribersByTier: [{ tier: 'basic', count: 1, autoRenewCount: 1 }],
  })
  await cancel({}, { uid: userId })
  expect(await stats({ limitDays: 1 })).toMatchObject({
    freeDayMembers: 2,
    subscribersByTier: [{ tier: 'basic', count: 1, autoRenewCount: 0 }],
  })
})

it('counts an exhausted paid row only while it can still renew, live or paused', async () => {
  const stats = getShopStats as (p: { limitDays: number }) => Promise<unknown>
  await rows(
    `insert into user_entitlements(user_id,entitlement_id,expires_time,auto_renew)
    values ($1,'supporter-basic',now()-interval '2 days',true)`,
    [userId]
  )
  const paid = [{ tier: 'basic', count: 1, autoRenewCount: 1 }]
  expect(await stats({ limitDays: 1 })).toMatchObject({
    freeDayMembers: 0,
    subscribersByTier: paid,
  })
  await grantMembershipDays(pg, input)
  expect(await stats({ limitDays: 1 })).toMatchObject({
    freeDayMembers: 1,
    subscribersByTier: paid,
  })
  await cancel({}, { uid: userId })
  expect(await stats({ limitDays: 1 })).toMatchObject({
    freeDayMembers: 1,
    subscribersByTier: [],
  })
})

it.each([
  {
    remaining: 2.5 * DAY_MS,
    autoRenew: false,
    balance: 100000,
    reason: 'cancelled',
  },
  {
    remaining: 3 * DAY_MS,
    autoRenew: true,
    balance: 0,
    reason: 'insufficient_balance',
  },
  { remaining: 1, autoRenew: false, balance: 100000, reason: 'cancelled' },
  { remaining: HOUR_MS, autoRenew: true, balance: 100000, reason: null },
  {
    remaining: HOUR_MS,
    autoRenew: false,
    balance: 0,
    optedOut: true,
    reason: null,
  },
  { remaining: 3 * DAY_MS + 1, autoRenew: false, balance: 0, reason: null },
  { remaining: 0, autoRenew: false, balance: 0, reason: null },
])(
  'checks restored paid expiry immediately ($remaining ms left, auto-renew $autoRenew, balance $balance)',
  async ({ remaining, autoRenew, balance, optedOut, reason }) => {
    const end = Date.UTC(2026, 10, 25, 18, 1) // 10:01 Pacific, after the daily scan.
    const durationMs = 4 * DAY_MS
    const start = end - durationMs
    const clock = jest.spyOn(Date, 'now').mockReturnValue(start)
    await rows('update users set balance = $1 where id = $2', [balance, userId])
    await rows(
      "insert into user_entitlements(user_id, entitlement_id, expires_time, auto_renew) values ($1, 'supporter-basic', $2, $3)",
      [userId, new Date(start + remaining), autoRenew]
    )
    await grantMembershipDays(pg, { ...input, durationMs })
    clock.mockReturnValue(end)
    if (optedOut)
      jest.mocked(getNotificationDestinationsForUser).mockReturnValueOnce({
        sendToBrowser: false,
        sendToMobile: false,
        sendToEmail: false,
        urlToManageThisNotification: '',
      })
    await processUserMembershipGrants(pg, userId)
    const notices = () =>
      rows(`select data->'data'->>'expiryReason' as reason from membership_notice_deliveries
      join user_notifications on notification_id = notice_key`)
    const expected = reason ? [{ reason }] : []
    expect(await notices()).toEqual(expected)
    await checkSubscriptionExpiry()
    expect(await notices()).toEqual(expected)
    expect(
      await rows('select notice_key from membership_notice_deliveries')
    ).toHaveLength(expected.length)
    expect(createPushNotifications).toHaveBeenCalledTimes(expected.length)
  }
)

it.each([true, false])(
  'sends one mobile-only paid expiry notice across reruns (auto-renew = %p)',
  async (autoRenew) => {
    // Both sides of midnight fall in the same 2?3 day warning window.
    const beforeMidnight = Date.UTC(2026, 10, 25, 23, 59)
    jest.useFakeTimers({
      now: beforeMidnight,
      doNotFake: [
        'hrtime',
        'nextTick',
        'performance',
        'queueMicrotask',
        'setImmediate',
        'clearImmediate',
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
      ],
    })
    const prefs = jest.mocked(getNotificationDestinationsForUser)
    const mobileOnly = {
      sendToEmail: false,
      sendToBrowser: false,
      sendToMobile: true,
      urlToManageThisNotification: '',
    }
    prefs.mockReturnValueOnce(mobileOnly).mockReturnValueOnce(mobileOnly)
    await rows('update users set balance = 0')
    await rows(
      `insert into user_entitlements(user_id,entitlement_id,expires_time,auto_renew)
    values ($1,'supporter-basic',$3,$2)`,
      [userId, autoRenew, new Date(beforeMidnight + 2.5 * DAY_MS)]
    )
    await checkSubscriptionExpiry()
    jest.setSystemTime(beforeMidnight + HOUR_MS)
    await checkSubscriptionExpiry()
    expect(createPushNotifications).toHaveBeenCalledTimes(1)
    expect(
      await rows('select notification_id from user_notifications')
    ).toHaveLength(0)
    expect(
      await rows('select user_id from membership_notice_deliveries')
    ).toEqual([{ user_id: userId }])
    const inbox = getNotifications as (
      p: { limit: number },
      auth: { uid: string }
    ) => Promise<unknown>
    expect(await inbox({ limit: 10 }, { uid: userId })).toEqual([])
  }
)

it.each(['initially immediate', 'initially deferred'])(
  'retries the notice after a failed inbox write or commit (%s)',
  async (timing) => {
    const now = Date.now()
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now)
    await grantMembershipDays(pg, { ...input, durationMs: 4 * DAY_MS })
    clock.mockReturnValue(now + 2 * DAY_MS)
    // The notice ID has no matching user. Exercise both INSERT and COMMIT failure.
    await db.exec(`alter table user_notifications add constraint fail_notice
      foreign key (notification_id) references users(id) deferrable ${timing}`)
    try {
      await checkSubscriptionExpiry()
      expect(await rows('select * from membership_notice_deliveries')).toEqual(
        []
      )
      expect(await rows('select * from user_notifications')).toEqual([])
      expect(broadcast).not.toHaveBeenCalled()
      expect(createPushNotifications).not.toHaveBeenCalled()
    } finally {
      await db.exec(
        'alter table user_notifications drop constraint fail_notice'
      )
    }
    await checkSubscriptionExpiry()
    await checkSubscriptionExpiry()
    expect(
      await rows(`select notice_key from membership_notice_deliveries
      join user_notifications on notice_key = notification_id`)
    ).toHaveLength(1)
    expect(broadcast).toHaveBeenCalledTimes(1)
    expect(createPushNotifications).toHaveBeenCalledTimes(1)
  }
)

it.each(['ownership', 'expiry', 'renewal'])(
  'skips a paid warning after a change of %s during the scan',
  async (change) => {
    const now = Date.now()
    jest.spyOn(Date, 'now').mockReturnValue(now)
    const durationMs = 2.5 * DAY_MS
    await rows(
      `insert into user_entitlements(user_id,entitlement_id,expires_time,auto_renew)
    values ($1,'supporter-plus',$2,false)`,
      [userId, new Date(now + durationMs)]
    )
    jest
      .spyOn(testClient, 'manyOrNone')
      .mockImplementationOnce(async (sql, params) => {
        const batch = await rows(sql, params)
        if (change === 'ownership')
          await grantMembershipDays(pg, { ...input, durationMs })
        else if (change === 'expiry')
          await rows(
            "update user_entitlements set expires_time = expires_time + interval '1 microsecond'"
          )
        else {
          await rows('update users set balance = 0')
          await rows('update user_entitlements set auto_renew = true')
        }
        return batch
      })
    await checkSubscriptionExpiry()
    // Changing ownership activates a short grant with its own immediate notice.
    const reasons = change === 'ownership' ? [{ reason: 'free_days' }] : []
    expect(
      await rows(
        "select data->'data'->>'expiryReason' as reason from user_notifications"
      )
    ).toEqual(reasons)
    expect(
      await rows('select notice_key from membership_notice_deliveries')
    ).toHaveLength(reasons.length)
    expect(createPushNotifications).toHaveBeenCalledTimes(reasons.length)
  }
)

it('distinguishes separate paid expiry events for the same tier on the same day', async () => {
  await rows(
    `insert into user_entitlements(user_id,entitlement_id,expires_time,auto_renew)
    values ($1,'supporter-plus',now()+interval '2.5 days',false)`,
    [userId]
  )
  await checkSubscriptionExpiry()
  await rows(
    "update user_entitlements set expires_time = expires_time + interval '1 microsecond'"
  )
  await checkSubscriptionExpiry()
  expect(
    await rows('select notice_key from membership_notice_deliveries')
  ).toHaveLength(2)
  expect(createPushNotifications).toHaveBeenCalledTimes(2)
})

it('delivers a cap-reduced four-hour grant notice at start and deduplicates a later scan', async () => {
  const now = Date.UTC(2026, 10, 25, 19) // 11:00 Pacific
  const clock = jest.spyOn(Date, 'now').mockReturnValue(now)
  await rows(
    `insert into user_entitlements(user_id, entitlement_id, expires_time, auto_renew)
     values ($1, 'supporter-premium', $2, true)`,
    [userId, new Date(now + 10 * DAY_MS)]
  )
  const held = await grantMembershipDays(pg, {
    ...input,
    durationMs: 30 * DAY_MS - 4 * HOUR_MS,
  })
  expect(held.outcome).toBe('banked')
  const { grant } = await grantMembershipDays(pg, {
    ...input,
    sourceId: 'short',
    tier: 'premium',
  })
  expect(grant).toMatchObject({
    status: 'active',
    durationMs: 4 * HOUR_MS,
    endsTime: now + 4 * HOUR_MS,
  })
  const noticeKey = `sub-expiry-grant-${grant.id}-${
    grant.endsTime! / 1000
  }.000000-free_days`
  expect(
    await rows(`select notice_key, data->'data' as payload from membership_notice_deliveries
    join user_notifications on notice_key = notification_id`)
  ).toEqual([
    {
      notice_key: noticeKey,
      payload: expect.objectContaining({
        expiryReason: 'free_days',
        grantEndsTime: grant.endsTime,
        nextMembership: { kind: 'paid', tier: 'premium' },
      }),
    },
  ])
  expect(broadcast).toHaveBeenCalledTimes(1)
  expect(createPushNotifications).toHaveBeenCalledTimes(1)
  await checkSubscriptionExpiry()
  clock.mockReturnValue(now + DAY_MS)
  await checkSubscriptionExpiry()
  expect(
    await rows('select notice_key from membership_notice_deliveries')
  ).toHaveLength(1)
  expect(
    await rows('select notification_id from user_notifications')
  ).toHaveLength(1)
  expect(broadcast).toHaveBeenCalledTimes(1)
  expect(createPushNotifications).toHaveBeenCalledTimes(1)
})

it.each([
  { duration: HOUR_MS + 1, immediate: true }, // Ends just after 10:00 Pacific.
  { duration: 3 * DAY_MS, immediate: true },
  { duration: 3 * DAY_MS + 1, immediate: false },
])(
  'checks the three-day warning window at activation for a grant lasting $duration ms',
  async ({ duration, immediate }) => {
    jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 10, 25, 17))
    await grantMembershipDays(pg, { ...input, durationMs: duration })
    expect(createPushNotifications).toHaveBeenCalledTimes(immediate ? 1 : 0)
  }
)

it.each([
  { remaining: 3 * DAY_MS + 1, eligible: false },
  { remaining: 3 * DAY_MS, eligible: true },
  { remaining: 1, eligible: true },
  { remaining: 0, eligible: false },
])(
  'checks the free notice window at $remaining ms remaining',
  async ({ remaining, eligible }) => {
    const now = Date.now()
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now)
    const issued = await grantMembershipDays(pg, {
      ...input,
      durationMs: 4 * DAY_MS,
    })
    clock.mockReturnValue(issued.grant.endsTime! - remaining)
    await checkSubscriptionExpiry()
    expect(createPushNotifications).toHaveBeenCalledTimes(eligible ? 1 : 0)
  }
)

it('sends another notice when the same grant restarts with a new expiry', async () => {
  const now = Date.now()
  const clock = jest.spyOn(Date, 'now').mockReturnValue(now)
  const issued = await grantMembershipDays(pg, { ...input, durationMs: DAY_MS })
  await checkSubscriptionExpiry()
  clock.mockReturnValue(now + HOUR_MS)
  await processUserMembershipGrants(pg, userId, 'end-active')
  clock.mockReturnValue(now + HOUR_MS + 1)
  expect((await processUserMembershipGrants(pg, userId)).started).toBe(
    issued.grant.id
  )
  await checkSubscriptionExpiry()
  await checkSubscriptionExpiry()
  expect(
    await rows(`select data->'data'->'grantEndsTime' as expiry from user_notifications
    order by expiry`)
  ).toEqual([{ expiry: now + DAY_MS }, { expiry: now + DAY_MS + 1 }])
  expect(
    await rows('select notice_key from membership_notice_deliveries')
  ).toHaveLength(2)
  expect(createPushNotifications).toHaveBeenCalledTimes(2)
})

it.each([false, true])(
  'sends a free-days expiry notice (paid membership paused = %p)',
  async (paid) => {
    const durationMs = (paid ? 2 : 1) * DAY_MS
    const endsTime = Date.UTC(2026, 10, 29, 2)
    jest.spyOn(Date, 'now').mockReturnValue(endsTime - durationMs)
    if (paid)
      await rows(
        "insert into user_entitlements(user_id,entitlement_id,expires_time,auto_renew) values ($1,'supporter-basic',$2,true)",
        [userId, new Date(endsTime + 20 * DAY_MS)]
      )
    const issued = await grantMembershipDays(pg, {
      ...input,
      durationMs,
    })
    await checkSubscriptionExpiry()
    await checkSubscriptionExpiry()
    expect(
      await rows('select notice_key from membership_notice_deliveries')
    ).toEqual([
      {
        notice_key: `sub-expiry-grant-${issued.grant.id}-${
          endsTime / 1000
        }.000000-free_days`,
      },
    ])
    expect(await rows('select data from user_notifications')).toEqual([
      {
        data: expect.objectContaining({
          sourceSlug: '/membership',
          data: expect.objectContaining({
            expiryReason: 'free_days',
            tierName: 'Pro',
            amount: 2500,
            grantEndsTime: issued.grant.endsTime,
            nextMembership: paid ? { kind: 'paid', tier: 'basic' } : null,
          }),
        }),
      },
    ])
    expect(createPushNotifications).toHaveBeenCalledTimes(1)
    const {
      rows: [inbox],
    } = await db.query<{ data: MembershipSubscriptionData }>(
      "select data->'data' as data from user_notifications"
    )
    const { tierName, grantEndsTime, amount, nextMembership } = inbox.data
    const inboxText = freeDaysExpiryMessage(
      tierName,
      grantEndsTime!,
      amount,
      nextMembership
    )
    expect(inboxText).toContain('Nov 28, 6:00 PM PT')
    expect(jest.mocked(createPushNotifications).mock.calls[0][0][0][3]).toBe(
      inboxText
    )
  }
)

it('restricts grants to admins and exposes the private ledger only through the owner view', async () => {
  const issue = adminGrantMembershipDays as (
    props: {
      userId: string
      tier: 'basic'
      days: number
      note: string
      key: string
    },
    auth: { uid: string }
  ) => Promise<unknown>
  const view = getMembershipGrants as Handler
  const request = {
    userId,
    tier: 'basic' as const,
    days: 2,
    note: 'internal support note',
    key: 'support-ticket-42',
  }
  await expect(issue(request, { uid: userId })).rejects.toMatchObject({
    code: 403,
  })
  expect(await issue(request, { uid: ENV_CONFIG.adminIds[0] })).toMatchObject({
    outcome: 'started',
  })
  expect(await issue(request, { uid: ENV_CONFIG.adminIds[0] })).toMatchObject({
    outcome: 'duplicate',
    grant: { sourceId: request.key },
  })
  expect(await rows('select id from membership_grants')).toHaveLength(1)
  await expect(view({ userId }, { uid: 'other' })).rejects.toMatchObject({
    code: 403,
  })
  const result = await view({}, { uid: userId })
  expect(result).toMatchObject({
    userId,
    active: { tier: 'basic', source: 'admin' },
    isLocked: true,
  })
  expect(JSON.stringify(result)).not.toContain(request.note)
  await db.exec(
    'create role grant_reader; grant select on membership_grants to grant_reader; set role grant_reader'
  )
  try {
    expect(await rows('select * from membership_grants')).toEqual([])
  } finally {
    await db.exec('reset role')
  }
})

it('persists the partial award and its note at the holding limit', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(Date.now())
  await grantMembershipDays(pg, { ...input, durationMs: 29 * DAY_MS })
  const award = await grantMembershipDays(pg, {
    ...input,
    sourceId: 'second',
    note: 'Support adjustment',
  })
  expect(award).toMatchObject({
    outcome: 'banked',
    grant: {
      durationMs: DAY_MS,
      note: expect.stringContaining('Support adjustment Holding cap reduced'),
    },
  })
})

it('records a grant the holding cap cuts to nothing as a used receipt', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(Date.now())
  await grantMembershipDays(pg, { ...input, durationMs: 30 * DAY_MS })
  const capped = await grantMembershipDays(pg, { ...input, sourceId: 'full' })
  expect(capped).toMatchObject({
    outcome: 'capped',
    grant: {
      status: 'used',
      durationMs: 0,
      note: expect.stringContaining('Holding cap reduced'),
    },
  })
  expect(
    await grantMembershipDays(pg, { ...input, sourceId: 'full' })
  ).toMatchObject({ outcome: 'duplicate', grant: { status: 'used' } })
})

it.each([
  { ends: Date.UTC(2026, 10, 25), expected: 'Nov 24, 4:00 PM PT' },
  { ends: Date.UTC(2026, 6, 25), expected: 'Jul 24, 5:00 PM PT' },
])(
  'names the free tier and Pacific expiry ($expected) in the purchase refusal',
  ({ ends, expected }) => {
    expect(membershipGrantLockMessage('plus', ends)).toBe(
      `You're using free Pro days until ${expected}. You can change your membership once your free days end.`
    )
  }
)
