jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(() => 'pg'),
}))
// Prod: an admin can create F1 markets by hand there too.
jest.mock('shared/utils', () => ({ isProd: () => true }))
jest.mock('shared/balldontlie-f1-client', () => ({
  hasBalldontlieKey: jest.fn(() => true),
}))
jest.mock('shared/f1-markets', () => ({ createF1Markets: jest.fn() }))
jest.mock('common/envs/constants', () => ({
  ...jest.requireActual('common/envs/constants'),
  isAdminId: (id: string) => id === 'admin',
}))

import { hasBalldontlieKey } from 'shared/balldontlie-f1-client'
import { createF1Markets } from 'shared/f1-markets'
import { adminSportsCreateF1Markets } from './admin-sports-create-f1-markets'

type Handler = (props: unknown, auth: { uid: string }) => Promise<unknown>
const handler = adminSportsCreateF1Markets as unknown as Handler

const log = [
  {
    key: '1869:winner',
    question: '2026 Mexico City Grand Prix: pole position',
    status: 'dry-run' as const,
    reason: null,
  },
]

beforeEach(() => {
  jest.mocked(createF1Markets).mockReset()
  jest.mocked(hasBalldontlieKey).mockReturnValue(true)
})

it('previews and creates F1 markets for an admin in prod', async () => {
  jest
    .mocked(createF1Markets)
    .mockResolvedValue({ created: 0, skipped: 1, errors: 0, log })
  await expect(
    handler({ competitionId: 'f1-2026', dryRun: true }, { uid: 'admin' })
  ).resolves.toEqual({ created: 0, skipped: 1, errors: 0, results: log })
  expect(createF1Markets).toHaveBeenCalledWith('pg', 'f1-2026', {
    dryRun: true,
    keys: undefined,
  })

  // Creating the markets ticked in the preview, and no switches: by hand,
  // every phase counts.
  await handler(
    { competitionId: 'f1-2026', keys: ['1869:winner'] },
    { uid: 'admin' }
  )
  expect(createF1Markets).toHaveBeenLastCalledWith('pg', 'f1-2026', {
    dryRun: false,
    keys: ['1869:winner'],
  })
})

it('refuses non-admins, other sports and a server with no key', async () => {
  await expect(
    handler({ competitionId: 'f1-2026', dryRun: true }, { uid: 'someone' })
  ).rejects.toMatchObject({ code: 403 })
  await expect(
    handler({ competitionId: 'nfl-regular-2026' }, { uid: 'admin' })
  ).rejects.toMatchObject({ code: 400 })
  jest.mocked(hasBalldontlieKey).mockReturnValue(false)
  await expect(
    handler({ competitionId: 'f1-2026' }, { uid: 'admin' })
  ).rejects.toMatchObject({ code: 500 })
  expect(createF1Markets).not.toHaveBeenCalled()
})
