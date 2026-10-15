jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(),
}))
jest.mock('shared/utils', () => ({ log: { error: jest.fn() } }))
jest.mock('shared/websockets/server', () => ({ broadcast: jest.fn() }))
jest.mock('shared/create-push-notifications', () => ({
  createPushNotifications: jest.fn().mockResolvedValue(undefined),
}))

import { PerpContract } from 'common/contract'
import { Notification } from 'common/notification'
import { PerpUserAlertState } from 'common/perps/alerts'
import { Row } from 'common/supabase/utils'
import { getDefaultNotificationPreferences } from 'common/user-notification-preferences'
import { DAY_MS } from 'common/util/time'
import { createPushNotifications } from 'shared/create-push-notifications'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { broadcast } from 'shared/websockets/server'
import { sendPerpPositionAlertsForUser } from './perp-position-alerts'

const now = 10 * DAY_MS
const contract = () =>
  ({
    id: 'c',
    mechanism: 'perp',
    oracleFeedId: 'test',
    question: 'Test price',
    slug: 'test',
    creatorName: 'Creator',
    creatorUsername: 'creator',
    oraclePrice: 100,
    oraclePriceTime: now,
    maxOraclePriceAgeMs: 60000,
  } as PerpContract)
const position = () => ({
  contract_id: 'c',
  user_id: 'u',
  direction: 'long',
  size: 1000,
  cost_basis: 100,
  original_cost_basis: 100,
  taker_fee_cost_basis: 0,
  entry_price: 100,
  leverage: 10,
  liquidation_price: 90,
  opened_time: new Date(now - DAY_MS).toISOString(),
  updated_time: new Date(now).toISOString(),
  contract: contract(),
})

// Transactional DB double: assertions exercise worker behavior across commits,
// rollbacks, and retries. PostgreSQL locking itself requires deployment QA.
const setup = () => {
  const preferences = getDefaultNotificationPreferences()
  const privateUser = {
    id: 'u',
    pushToken: 'test-token',
    notificationPreferences: preferences,
  }
  let state: PerpUserAlertState | undefined
  let rows = [position()]
  const notifications: Notification[] = []
  let failCommit = false
  let committed = false
  const queries: string[] = []
  const pg = {
    tx: jest.fn(async (fn) => {
      committed = false
      let pendingState: PerpUserAlertState | undefined
      const pendingNotifications: Notification[] = []
      const tx = {
        one: jest.fn(async (sql: string) => {
          queries.push(sql)
          return {}
        }),
        oneOrNone: jest.fn(async (sql: string) => {
          if (sql.includes('private_users'))
            return { data: privateUser } as unknown as Row<'private_users'>
          if (sql.includes('perp_alert_states'))
            return state ? { data: structuredClone(state) } : null
          throw new Error(`Unexpected query: ${sql}`)
        }),
        manyOrNone: jest.fn(async () => rows),
        none: jest.fn(async (sql: string, params: unknown[]) => {
          if (sql.includes('insert into user_notifications'))
            pendingNotifications.push(params[2] as Notification)
          else if (sql.includes('insert into perp_alert_states'))
            pendingState = params[1] as PerpUserAlertState
          else throw new Error(`Unexpected query: ${sql}`)
        }),
      }
      const result = await fn(tx)
      if (failCommit) throw new Error('commit failed')
      state = pendingState
      notifications.push(...pendingNotifications)
      committed = true
      return result
    }),
  } as unknown as SupabaseDirectClient
  return {
    preferences,
    notifications,
    queries,
    scan: () => sendPerpPositionAlertsForUser(pg, 'u'),
    setPrice: (price: number) =>
      rows.forEach((r) => (r.contract.oraclePrice = price)),
    setRows: (next: typeof rows) => {
      rows = next
    },
    rows: () => rows,
    state: () => state!,
    failCommit: (fail: boolean) => {
      failCommit = fail
    },
    committed: () => committed,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(broadcast).mockReset()
  jest.spyOn(Date, 'now').mockReturnValue(now)
  jest.mocked(createPushNotifications).mockResolvedValue(undefined)
})
afterEach(() => jest.restoreAllMocks())

it('commits state and browser alert together, then broadcasts; repeated scans deduplicate', async () => {
  const db = setup()
  await db.scan()
  db.setPrice(110)
  jest.mocked(broadcast).mockImplementation(() => {
    expect(db.committed()).toBe(true)
    expect(db.notifications).toHaveLength(1)
  })
  await db.scan()
  await db.scan()
  expect(db.notifications).toHaveLength(1)
  expect(db.notifications[0]).toMatchObject({
    reason: 'perp_profit',
    sourceContractSlug: 'test',
    data: { pnlPercent: 100 },
  })
  expect(db.notifications[0].sourceText).toContain('up 100%')
  expect(broadcast).toHaveBeenCalledTimes(1)
  expect(createPushNotifications).not.toHaveBeenCalled()
  expect(db.queries.every((sql) => sql.includes('pg_advisory_xact_lock'))).toBe(
    true
  )
})

it('rolls back both dedup state and notification on commit failure, permitting retry', async () => {
  const db = setup()
  await db.scan()
  db.setPrice(110)
  db.failCommit(true)
  await expect(db.scan()).rejects.toThrow('commit failed')
  expect(db.state().positions['c:long'].profit).toBe(0)
  expect(db.notifications).toHaveLength(0)
  expect(broadcast).not.toHaveBeenCalled()
  db.failCommit(false)
  await db.scan()
  expect(db.notifications).toHaveLength(1)
})

it('supports mobile-only delivery and deduplicates without browser history', async () => {
  const db = setup()
  db.preferences.perp_profit = ['mobile']
  await db.scan()
  db.setPrice(110)
  await db.scan()
  await db.scan()
  expect(db.notifications).toHaveLength(0)
  expect(createPushNotifications).toHaveBeenCalledTimes(1)
})

it('honors all-channel opt-out and does not replay muted milestones', async () => {
  const db = setup()
  db.preferences.opt_out_all = ['browser', 'mobile', 'email']
  await db.scan()
  db.setPrice(110)
  await db.scan()
  db.preferences.opt_out_all = []
  await db.scan()
  expect(db.notifications).toHaveLength(0)
  expect(createPushNotifications).not.toHaveBeenCalled()
})

it('retains defaults for existing users missing new preference keys', async () => {
  const db = setup()
  delete (db.preferences as Partial<typeof db.preferences>)
    .perp_liquidation_warning
  db.setPrice(92.5)
  await db.scan()
  expect(db.notifications[0].reason).toBe('perp_liquidation_warning')
  expect(db.notifications[0].sourceText).toContain('close to liquidation')
  expect(createPushNotifications).toHaveBeenCalledTimes(1)
})

it.each(['stale', 'halted', 'resolved', 'unavailable'] as const)(
  'skips %s markets and preserves previous state',
  async (status) => {
    const db = setup()
    await db.scan()
    db.setPrice(110)
    const market = db.rows()[0].contract
    if (status === 'stale') market.oraclePriceTime = now - DAY_MS
    if (status === 'halted') market.solvencyHaltTime = now
    if (status === 'resolved') market.isResolved = true
    if (status === 'unavailable')
      market.oracleFeedHealth = {
        status: 'unavailable',
        checkedAt: now,
      } as PerpContract['oracleFeedHealth']
    await db.scan()
    expect(db.notifications).toHaveLength(0)
    expect(db.state().positions['c:long'].profit).toBe(0)
  }
)

it('shares the PnL cap across positions but permits a risk warning', async () => {
  const db = setup()
  const second = position()
  second.contract_id = 'd'
  second.contract.id = 'd'
  db.setRows([position(), second])
  await db.scan()
  db.setPrice(110)
  await db.scan()
  expect(db.notifications).toHaveLength(1)
  second.contract.oraclePrice = 92.5
  await db.scan()
  expect(db.notifications.map((n) => n.reason)).toEqual([
    'perp_profit',
    'perp_liquidation_warning',
  ])
})

it('prunes closed positions and baselines a reopened position independently', async () => {
  const db = setup()
  await db.scan()
  db.setRows([])
  await db.scan()
  expect(db.state().positions).toEqual({})
  const reopened = position()
  reopened.opened_time = new Date(now).toISOString()
  db.setRows([reopened])
  await db.scan()
  db.setPrice(110)
  await db.scan()
  expect(db.notifications).toHaveLength(1)
})

it('a push outage cannot roll back or repeatedly deliver a browser risk alert', async () => {
  const db = setup()
  jest
    .mocked(createPushNotifications)
    .mockRejectedValue(new Error('Expo unavailable'))
  db.setPrice(92.5)
  await db.scan()
  await db.scan()
  expect(db.notifications).toHaveLength(1)
  expect(createPushNotifications).toHaveBeenCalledTimes(1)
})
