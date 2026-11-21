jest.mock('shared/utils', () => ({
  LOCAL_ONLY: true,
  log: { warn: jest.fn() },
}))
jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(() => ({ localTestClient: true })),
}))
jest.mock('shared/bdl/attention-queries', () => ({
  getSportsAttention: jest.fn(),
}))
jest.mock('common/envs/constants', () => ({
  ...jest.requireActual('common/envs/constants'),
  isAdminId: (id: string) => id === 'admin',
  isModId: (id: string) => id === 'mod',
}))

import { API } from 'common/api/schema'
import { type SportsAttentionPage } from 'common/bdl/attention'
import type { Request, Response } from 'express'
import { getSportsAttention } from 'shared/bdl/attention-queries'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { adminSportsBdlAttention } from './admin-sports-bdl-attention'
import { typedEndpoint } from './helpers/endpoint'

const name = 'admin-sports-bdl-attention'
const endpoint = typedEndpoint(name, adminSportsBdlAttention)
const end: SportsAttentionPage = { items: [], nextCursor: null }

async function request(query: Record<string, unknown>, uid?: string) {
  const req = {
    query,
    params: {},
    get: (name: string) => (name === 'X-Local-User' ? uid : undefined),
  } as unknown as Request
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() }
  const next = jest.fn()
  await endpoint(req, res as unknown as Response, next)
  return { res, next }
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getSportsAttention).mockResolvedValue(end)
})

it('publishes an authenticated, private, undocumented GET', () => {
  expect(API[name]).toMatchObject({
    method: 'GET',
    authed: true,
    visibility: 'undocumented',
    cache: 'private, no-store',
  })
})

it.each([
  [undefined, 401],
  ['visitor', 403],
  ['mod', 403],
] as const)(
  'refuses %s before opening the service database',
  async (uid, code) => {
    const { res, next } = await request({}, uid)
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code }))
    expect(res.json).not.toHaveBeenCalled()
    expect(createSupabaseDirectClient).not.toHaveBeenCalled()
    expect(getSportsAttention).not.toHaveBeenCalled()
  }
)

it.each([
  { cursor: '' },
  { cursor: 'unknown' },
  { cursor: '2:1710003600000:u:x' },
  { cursor: '1:8640000000000000:u:x' },
  { cursor: '1:100:101:x' },
  { cursor: '1:100:u:../x' },
  { cursor: '0'.repeat(257) },
  { cursor: ['unknown'] },
  { cursor: { id: 'x' } },
  { limit: '0' },
  { limit: '-1' },
  { limit: '101' },
  { limit: '1.2' },
  { limit: '1e1' },
  { limit: ['5'] },
  { limit: true },
  { league: 'nba' },
])('rejects malformed query %j before opening the database', async (query) => {
  const { res, next } = await request(query, 'admin')
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 400 }))
  expect(res.json).not.toHaveBeenCalled()
  expect(createSupabaseDirectClient).not.toHaveBeenCalled()
})

it.each([
  ['1', 1],
  ['100', 100],
  [15, 15],
] as const)(
  'accepts bounded page size %s and preserves an empty page',
  async (limit, parsed) => {
    const { res, next } = await request({ limit }, 'admin')
    expect(next).not.toHaveBeenCalled()
    expect(getSportsAttention).toHaveBeenCalledWith(
      jest.mocked(createSupabaseDirectClient).mock.results[0].value,
      { limit: parsed }
    )
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(end)
  }
)

it('propagates reader outages through the normal API error path', async () => {
  const failure = Error('synthetic database unavailable')
  jest.mocked(getSportsAttention).mockRejectedValueOnce(failure)
  const { res, next } = await request({}, 'admin')
  expect(next).toHaveBeenCalledWith(failure)
  expect(res.json).not.toHaveBeenCalled()
})

it.each(['1710000000000', 'u'])(
  'passes through a stable continuation for onset %s',
  async (onset) => {
    const cursor = '1:1710003600000:' + onset + ':contractA'
    const first: SportsAttentionPage = {
      items: [
        {
          id: 'contractA',
          question: 'Synthetic official game',
          href: '/ManifoldSports/example',
          league: 'nba',
          provider: 'bdl',
          reason: 'score-disagreement',
          source: 'stored',
          since: onset === 'u' ? null : Number(onset),
          closeTime: 1710000000000,
        },
      ],
      nextCursor: cursor,
    }
    jest.mocked(getSportsAttention).mockResolvedValueOnce(first)
    const firstRequest = await request({}, 'admin')
    expect(firstRequest.next).not.toHaveBeenCalled()
    expect(firstRequest.res.json).toHaveBeenCalledWith(first)
    const second = await request({ cursor, limit: '25' }, 'admin')
    expect(second.next).not.toHaveBeenCalled()
    expect(getSportsAttention).toHaveBeenLastCalledWith(
      { localTestClient: true },
      { cursor, limit: 25 }
    )
    expect(second.res.json).toHaveBeenCalledWith(end)
  }
)
