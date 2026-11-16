jest.mock('api/helpers/endpoint', () => ({
  APIError: jest.requireActual('common/api/utils').APIError,
}))
jest.mock('api/helpers/rate-limit', () => ({
  getActiveUserBans: jest.fn(async () => []),
}))
jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(),
}))
jest.mock('shared/utils', () => ({
  getUser: jest.fn(async () => ({ id: 'user-1' })),
  getPrivateUser: jest.fn(async () => ({ id: 'user-1' })),
  log: Object.assign(jest.fn(), { error: jest.fn(), warn: jest.fn() }),
}))
jest.mock('shared/analytics', () => ({ track: jest.fn() }))

import { APIError } from 'common/api/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { createDaimoSession } from './create-daimo-session'

type Handler = (props: { offerId?: string }, auth: { uid: string }) => unknown
const handler = createDaimoSession as unknown as Handler

const LOCK_ID = 'pending-lock-1'

// Records every statement so each test can assert whether the offer lock was
// claimed and released, and with which parameters.
const makePg = () => {
  const calls: { sql: string; params: unknown[] }[] = []
  const pg = {
    oneOrNone: jest.fn(async (sql: string, params: unknown[]) => {
      calls.push({ sql, params })
      if (/^\s*update personalized_mana_offers/.test(sql))
        return { payment_pending_session_id: LOCK_ID }
      return null
    }),
    none: jest.fn(async (sql: string, params: unknown[]) => {
      calls.push({ sql, params })
    }),
  }
  jest.mocked(createSupabaseDirectClient).mockReturnValue(pg as never)
  return { pg, calls }
}

const releaseCalls = (calls: { sql: string; params: unknown[] }[]) =>
  calls.filter((c) => /payment_pending_at = null/.test(c.sql))

const mockFetch = (impl: () => Promise<unknown>) => {
  global.fetch = jest.fn(impl) as unknown as typeof fetch
}

const jsonResponse = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
})

const expiredAccess = jsonResponse(403, {
  error: {
    type: 'authentication_error',
    code: 'access_denied',
    message: 'Manifold Markets access expired. contact support@daimo.com',
  },
})

const originalFetch = global.fetch

beforeEach(() => {
  process.env.DAIMO_API_KEY = 'test-key'
  process.env.DAIMO_HOT_WALLET_ADDRESS = '0xhotwallet'
})

afterEach(() => {
  global.fetch = originalFetch
  jest.clearAllMocks()
})

const expectApiError = async (p: unknown, code: number) => {
  let caught: unknown
  try {
    await p
  } catch (e) {
    caught = e
  }
  expect(caught).toBeInstanceOf(APIError)
  expect((caught as APIError).code).toBe(code)
  return caught as APIError
}

describe('createDaimoSession', () => {
  it('returns 503 when Daimo rejects our access, and releases the offer lock it took', async () => {
    const { calls } = makePg()
    mockFetch(async () => expiredAccess)

    const err = await expectApiError(
      handler({ offerId: 'offer-1' }, { uid: 'user-1' }),
      503
    )
    expect(err.message).toMatch(/temporarily unavailable/i)

    const released = releaseCalls(calls)
    expect(released).toHaveLength(1)
    // Only our own lock, scoped to this user's offer.
    expect(released[0].params).toEqual(['offer-1', 'user-1', LOCK_ID])
    expect(released[0].sql).toMatch(/payment_pending_session_id = \$3/)
  })

  it('maps 401, 429 and 5xx to 503 too', async () => {
    for (const status of [401, 429, 500, 502]) {
      makePg()
      mockFetch(async () => jsonResponse(status, {}))
      await expectApiError(handler({}, { uid: 'user-1' }), 503)
    }
  })

  it('keeps a 500 for request errors that are ours to fix (400)', async () => {
    const { calls } = makePg()
    mockFetch(async () => jsonResponse(400, { error: { code: 'bad' } }))

    await expectApiError(
      handler({ offerId: 'offer-1' }, { uid: 'user-1' }),
      500
    )
    expect(releaseCalls(calls)).toHaveLength(1)
  })

  it('releases the lock when the request never reaches Daimo', async () => {
    const { calls } = makePg()
    mockFetch(async () => {
      throw new Error('ECONNRESET')
    })

    await expectApiError(
      handler({ offerId: 'offer-1' }, { uid: 'user-1' }),
      500
    )
    expect(releaseCalls(calls)).toHaveLength(1)
  })

  it('releases the lock when Daimo answers 200 without a client secret', async () => {
    const { calls } = makePg()
    mockFetch(async () => jsonResponse(200, { session: { sessionId: 's1' } }))

    await expectApiError(
      handler({ offerId: 'offer-1' }, { uid: 'user-1' }),
      500
    )
    expect(releaseCalls(calls)).toHaveLength(1)
  })

  it('touches no offer row for a plain (non-offer) purchase that fails', async () => {
    const { calls } = makePg()
    mockFetch(async () => expiredAccess)

    await expectApiError(handler({}, { uid: 'user-1' }), 503)
    expect(calls).toHaveLength(0)
  })

  it('keeps the lock and returns the session when Daimo succeeds', async () => {
    const { calls } = makePg()
    mockFetch(async () =>
      jsonResponse(200, {
        session: { sessionId: 'sess-1', clientSecret: 'secret-1' },
      })
    )

    await expect(
      handler({ offerId: 'offer-1' }, { uid: 'user-1' })
    ).resolves.toEqual({ sessionId: 'sess-1', clientSecret: 'secret-1' })
    expect(releaseCalls(calls)).toHaveLength(0)
  })

  it('still reports the Daimo failure if releasing the lock fails', async () => {
    const { pg } = makePg()
    pg.none.mockRejectedValueOnce(new Error('db down'))
    mockFetch(async () => expiredAccess)

    await expectApiError(
      handler({ offerId: 'offer-1' }, { uid: 'user-1' }),
      503
    )
  })
})
