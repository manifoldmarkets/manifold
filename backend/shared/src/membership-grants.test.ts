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
import { checkSubscriptionExpiry } from 'scheduler/jobs/check-subscription-expiry'
import { insertNotificationToSupabase } from './supabase/notifications'
import { runTxnInBetQueue } from './txn/run-txn'
import { membershipGrantLockMessage } from 'common/membership-grants'
import { DAY_MS } from 'common/util/time'
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

jest.mock('./websockets/helpers', () => ({ broadcastUpdatedUser: jest.fn() }))
jest.mock('./supabase/init', () => ({
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
jest.mock('shared/supabase/notifications', () => ({
  insertNotificationToSupabase: jest.fn(),
}))
jest.mock('shared/create-push-notifications', () => ({
  createPushNotifications: jest.fn(),
}))
jest.mock('common/user-notification-preferences', () => ({
  getNotificationDestinationsForUser: () => ({
    sendToBrowser: true,
    sendToMobile: false,
  }),
}))
jest.mock('shared/helpers/fn-queue', () => ({
  betsQueue: { enqueueFn: (fn: () => unknown) => fn() },
}))
jest.mock('shared/txn/run-txn', () => ({
  runTxnOutsideBetQueue: jest.fn(),
  runTxnInBetQueue: jest.fn(),
}))

// Execute production SQL against the real migration. Match the direct client's
// text timestamps and int8 parser, and assert the retry wrapper's isolation level.
let db: PGlite
const pgp = pgPromise()
const rows = async (sql: string, params?: unknown) =>
  (await db.query(pgp.as.format(sql, params))).rows
const tx = {
  manyOrNone: rows,
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
const pg = {
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
} as unknown as SupabaseDirectClientTimeout
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

beforeAll(async () => {
  db = new PGlite({ parsers: { 1184: (v: string) => v, 20: Number } })
  await db.exec(`create table users(id text primary key);
 create table user_entitlements(user_id text, entitlement_id text, granted_time timestamptz not null default now(), expires_time timestamptz, enabled boolean default true, auto_renew boolean default false, metadata jsonb, primary key(user_id,entitlement_id));
 insert into users values ('member');`)
  await db.exec(
    readFileSync(
      join(
        __dirname,
        '../../supabase/migrations/2026112503_membership_grants.sql'
      ),
      'utf8'
    )
  )
  jest.mocked(createSupabaseDirectClient).mockReturnValue(pg)
}, 30000)
beforeEach(async () => {
  jest.clearAllMocks()
  await db.exec('truncate membership_grants, user_entitlements')
})
afterEach(() => {
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
  expect(runTxnInBetQueue).not.toHaveBeenCalled()
  expect((await supporter())?.autoRenew).toBe(true)
})

it.each([false, true])(
  'sends a free-days expiry notice (paid membership paused = %p)',
  async (paid) => {
    if (paid)
      await rows(
        "insert into user_entitlements(user_id,entitlement_id,expires_time,auto_renew) values ($1,'supporter-basic',now()+interval '20 days',true)",
        [userId]
      )
    const issued = await grantMembershipDays(pg, {
      ...input,
      durationMs: 2.5 * DAY_MS,
    })
    await checkSubscriptionExpiry()
    expect(insertNotificationToSupabase).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceSlug: '/membership',
        data: expect.objectContaining({
          expiryReason: 'free_days',
          tierName: 'Pro',
          amount: 2500,
          grantEndsTime: issued.grant.endsTime,
          paidTierName: paid ? 'Plus' : undefined,
        }),
      }),
      pg
    )
  }
)

it('restricts grants to admins and exposes the private ledger only through the owner view', async () => {
  const issue = adminGrantMembershipDays as (
    props: { userId: string; tier: 'basic'; days: number; note: string },
    auth: { uid: string }
  ) => Promise<unknown>
  const view = getMembershipGrants as Handler
  const request = {
    userId,
    tier: 'basic' as const,
    days: 2,
    note: 'internal support note',
  }
  await expect(issue(request, { uid: userId })).rejects.toMatchObject({
    code: 403,
  })
  expect(await issue(request, { uid: ENV_CONFIG.adminIds[0] })).toMatchObject({
    outcome: 'started',
  })
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

it('names the free tier and expiry in the purchase refusal', () => {
  const ends = Date.UTC(2026, 10, 25)
  expect(membershipGrantLockMessage('plus', ends)).toBe(
    `You're using free Pro days until ${new Date(
      ends
    ).toLocaleDateString()}. You can change your membership after they end.`
  )
})
