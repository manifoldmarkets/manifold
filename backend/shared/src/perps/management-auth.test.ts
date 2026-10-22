import { PerpContract } from 'common/contract'
import { ENV, ENV_CONFIG } from 'common/envs/constants'
import { MNX_CREATOR_IDS } from 'common/perps/creator-accounts'
import { isPerpManager, requirePerpManager } from './management-auth'
import { SupabaseDirectClient } from 'shared/supabase/init'

const mnxId = 'mnx-test-id'
const ids = { ...MNX_CREATOR_IDS }
beforeEach(() => {
  MNX_CREATOR_IDS[ENV] = mnxId
})
afterEach(() => Object.assign(MNX_CREATOR_IDS, ids))
const own = {
  creatorId: mnxId,
  oracleFeedId: 'mnx-openai-mark',
} as PerpContract

it('limits the partner to its own registered MNX feeds, including after renames', () => {
  expect(isPerpManager(mnxId, own)).toBe(true)
  expect(isPerpManager(mnxId, { ...own, creatorId: 'someone-else' })).toBe(
    false
  )
  expect(isPerpManager(mnxId, { ...own, oracleFeedId: 'btc-usd' })).toBe(false)
  expect(
    isPerpManager(mnxId, { ...own, oracleFeedId: 'mnx-not-registered' })
  ).toBe(false)
  expect(
    isPerpManager('username-squatter', { ...own, creatorUsername: 'MNX' })
  ).toBe(false)
  expect(isPerpManager(ENV_CONFIG.adminIds[0], own)).toBe(true)
  MNX_CREATOR_IDS[ENV] = undefined
  expect(isPerpManager(mnxId)).toBe(false)
})

it.each([null, { userDeleted: true }, { isBannedFromPosting: true }])(
  'refuses unavailable manager accounts: %j',
  async (data) => {
    const pg = {
      oneOrNone: jest.fn(async (_q, _p, convert) =>
        convert(
          data === null ? null : { id: mnxId, username: 'RenamedPartner', data }
        )
      ),
    } as unknown as SupabaseDirectClient
    await expect(requirePerpManager(pg, mnxId, own)).rejects.toThrow(
      'active, unbanned'
    )
  }
)

it('rejects an unauthorized caller before looking up any account data', async () => {
  const pg = { oneOrNone: jest.fn() } as unknown as SupabaseDirectClient
  await expect(requirePerpManager(pg, 'other', own)).rejects.toThrow(
    'Only admins'
  )
  expect(pg.oneOrNone).not.toHaveBeenCalled()
})
