import { SupabaseDirectClient } from '../supabase/init'
import {
  getPerpCreatorAccountMismatch,
  MNX_CREATOR_IDS,
  resolvePerpCreatorAccount,
} from './creator-accounts'
import { getPerpLaunchCreatorId } from './launch-manifest'

const row = (overrides: Record<string, unknown>) => ({
  id: 'mnx-user',
  username: 'MNX',
  name: 'MNX',
  balance: 0,
  cash_balance: 0,
  spice_balance: 0,
  total_deposits: 0,
  total_cash_deposits: 0,
  created_time: '2026-01-01T00:00:00Z',
  data: {},
  ...overrides,
})

const clientReturning = (
  result: Record<string, unknown> | null,
  calls: { sql: string; values: unknown[] }[] = []
) =>
  ({
    oneOrNone: jest.fn(
      async (sql: string, values: unknown[], cb?: (r: unknown) => unknown) => {
        calls.push({ sql, values })
        return cb ? cb(result) : result
      }
    ),
  } as unknown as SupabaseDirectClient)

const configured = { ...MNX_CREATOR_IDS }
afterEach(() => Object.assign(MNX_CREATOR_IDS, configured))

it('pins the official account by environment id', async () => {
  const calls: { sql: string; values: unknown[] }[] = []
  const pg = clientReturning(
    row({ id: getPerpLaunchCreatorId('PROD'), username: 'ManifoldMarkets' }),
    calls
  )
  const resolved = await resolvePerpCreatorAccount('manifold', 'PROD', pg)
  expect(resolved.user?.id).toBe(getPerpLaunchCreatorId('PROD'))
  expect(calls[0].sql).toContain('where id = $1')
  expect(calls[0].values).toEqual([getPerpLaunchCreatorId('PROD')])
})

it('keeps the partner unavailable until an id is configured', async () => {
  MNX_CREATOR_IDS.DEV = undefined
  const pg = clientReturning(row({}))
  const missing = await resolvePerpCreatorAccount('mnx', 'DEV', pg)
  expect(missing.user).toBeNull()
  expect(missing.reason).toBe(
    'no MNX account id is configured for DEV (MNX_CREATOR_IDS in common/src/perps/creator-accounts.ts)'
  )
  expect(pg.oneOrNone).not.toHaveBeenCalled()
})

it('resolves the partner by its pinned id, never by username', async () => {
  MNX_CREATOR_IDS.PROD = 'mnx-user'
  const calls: { sql: string; values: unknown[] }[] = []
  const found = await resolvePerpCreatorAccount(
    'mnx',
    'PROD',
    clientReturning(row({}), calls)
  )
  expect(found.user?.id).toBe('mnx-user')
  expect(calls[0].sql).toContain('where id = $1')
  expect(calls[0].sql).not.toContain('username')
  expect(calls[0].values).toEqual(['mnx-user'])
  expect(getPerpCreatorAccountMismatch(found)).toBeNull()

  const gone = await resolvePerpCreatorAccount(
    'mnx',
    'PROD',
    clientReturning(null)
  )
  expect(gone.user).toBeNull()
  expect(gone.reason).toBe('MNX account mnx-user does not exist in PROD')
})

it('refuses a deleted or banned owner', async () => {
  MNX_CREATOR_IDS.PROD = 'mnx-user'
  const banned = await resolvePerpCreatorAccount(
    'mnx',
    'PROD',
    clientReturning(row({ isBannedFromPosting: true }))
  )
  expect(banned.user).toBeNull()
  expect(banned.reason).toBe('MNX (@MNX, mnx-user) is banned')

  const deleted = await resolvePerpCreatorAccount(
    'mnx',
    'PROD',
    clientReturning(row({ data: { userDeleted: true } }))
  )
  expect(deleted.user).toBeNull()
  expect(deleted.reason).toBe('MNX (@MNX, mnx-user) is deleted')
})

it('flags a pinned id whose account no longer carries the partner name', async () => {
  MNX_CREATOR_IDS.PROD = 'mnx-user'
  const renamed = await resolvePerpCreatorAccount(
    'mnx',
    'PROD',
    clientReturning(row({ username: 'SomeoneElse' }))
  )
  expect(renamed.user?.id).toBe('mnx-user')
  expect(getPerpCreatorAccountMismatch(renamed)).toBe(
    'configured MNX partner account mnx-user is now @SomeoneElse, not @MNX; confirm MNX_CREATOR_IDS before creating'
  )
  const official = await resolvePerpCreatorAccount(
    'manifold',
    'PROD',
    clientReturning(row({ id: getPerpLaunchCreatorId('PROD'), username: 'X' }))
  )
  expect(getPerpCreatorAccountMismatch(official)).toBeNull()
})
