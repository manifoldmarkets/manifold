import { SupabaseDirectClient } from '../supabase/init'
import { resolvePerpCreatorAccount } from './creator-accounts'
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

it('looks the partner up by username and explains a missing account', async () => {
  const calls: { sql: string; values: unknown[] }[] = []
  const found = await resolvePerpCreatorAccount(
    'mnx',
    'DEV',
    clientReturning(row({}), calls)
  )
  expect(found.user?.id).toBe('mnx-user')
  expect(calls[0].sql).toContain('where username = $1')
  expect(calls[0].values).toEqual(['MNX'])

  const missing = await resolvePerpCreatorAccount(
    'mnx',
    'DEV',
    clientReturning(null)
  )
  expect(missing.user).toBeNull()
  expect(missing.reason).toBe('no @MNX account exists in DEV')
})

it('refuses a deleted or banned owner', async () => {
  const banned = await resolvePerpCreatorAccount(
    'mnx',
    'PROD',
    clientReturning(row({ isBannedFromPosting: true }))
  )
  expect(banned.user).toBeNull()
  expect(banned.reason).toBe('MNX (@MNX) is banned')

  const deleted = await resolvePerpCreatorAccount(
    'mnx',
    'PROD',
    clientReturning(row({ data: { userDeleted: true } }))
  )
  expect(deleted.user).toBeNull()
  expect(deleted.reason).toBe('MNX (@MNX) is deleted')
})
