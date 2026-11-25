import { isSportsBdlEnabled } from 'common/bdl/rollout'
jest.mock('common/bdl/rollout', () => ({
  isSportsBdlEnabled: jest.fn(() => true),
}))
import { getBdlOperatorPanel } from 'shared/bdl/operator-panel-queries'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { adminSportsBdlCompetitions } from './admin-sports-bdl-competitions'

jest.mock('common/envs/constants', () => ({
  ...jest.requireActual('common/envs/constants'),
  isAdminId: (id: string) => id === 'admin',
}))
jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(() => 'pg'),
}))
jest.mock('shared/bdl/operator-panel-queries', () => ({
  getBdlOperatorPanel: jest.fn(async () => ({ leagues: [] })),
}))

const handle = adminSportsBdlCompetitions as unknown as (
  props: Record<string, never>,
  auth: { uid: string }
) => Promise<unknown>
beforeEach(() => jest.clearAllMocks())

it('rejects a non-admin before accessing the database', async () => {
  await expect(handle({}, { uid: 'reader' })).rejects.toMatchObject({
    code: 403,
  })
  expect(createSupabaseDirectClient).not.toHaveBeenCalled()
  expect(getBdlOperatorPanel).not.toHaveBeenCalled()
})

it('returns the shared read model for an admin', async () => {
  await expect(handle({}, { uid: 'admin' })).resolves.toEqual({ leagues: [] })
  expect(getBdlOperatorPanel).toHaveBeenCalledWith('pg')
})

it('keeps the disabled operator route off the database', async () => {
  jest.mocked(isSportsBdlEnabled).mockReturnValueOnce(false)
  await expect(handle({}, { uid: 'admin' })).rejects.toMatchObject({
    code: 404,
  })
  expect(createSupabaseDirectClient).not.toHaveBeenCalled()
})
