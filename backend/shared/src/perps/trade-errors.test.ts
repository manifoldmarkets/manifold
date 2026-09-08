import { APIError } from 'common/api/utils'
import { log } from 'shared/monitoring/log'
import { runTransactionWithRetries } from 'shared/transact-with-retries'
import { isExpectedPerpTradeError } from './trade-errors'

jest.mock('shared/monitoring/log', () => ({
  log: Object.assign(jest.fn(), { warn: jest.fn(), error: jest.fn() }),
}))
jest.mock('shared/supabase/init', () => ({
  SERIAL_MODE: {},
  createSupabaseDirectClient: () => ({
    tx: (_options: unknown, callback: () => Promise<unknown>) => callback(),
  }),
}))

beforeEach(() => {
  jest.clearAllMocks()
})

it('logs a stale-price trade rejection once at WARN and returns the original error', async () => {
  const error = new APIError(400, 'Oracle feed is stale')
  const trade = jest.fn(async () => {
    throw error
  })
  await expect(
    runTransactionWithRetries(trade, 8, {
      isExpectedError: isExpectedPerpTradeError,
    })
  ).rejects.toBe(error)
  expect(trade).toHaveBeenCalledTimes(1)
  expect(log.warn).toHaveBeenCalledWith(
    expect.stringContaining('Oracle feed is stale')
  )
  expect(log.error).not.toHaveBeenCalled()
})

it.each([500, 503] as const)(
  'keeps a trade failure with status %s at ERROR',
  async (code) => {
    const error = new APIError(code, 'Engine cannot complete the trade')
    await expect(
      runTransactionWithRetries(
        async () => {
          throw error
        },
        8,
        {
          isExpectedError: isExpectedPerpTradeError,
        }
      )
    ).rejects.toBe(error)
    expect(log.error).toHaveBeenCalledTimes(1)
    expect(log.warn).not.toHaveBeenCalled()
  }
)

it('does not downgrade a scheduled operation that rejects the same input', async () => {
  const error = new APIError(400, 'Invalid oracle transition')
  await expect(
    runTransactionWithRetries(async () => {
      throw error
    }, 8)
  ).rejects.toBe(error)
  expect(log.error).toHaveBeenCalledTimes(1)
  expect(log.warn).not.toHaveBeenCalled()
})

it('does not mistake an unrelated error carrying a numeric code for a trade rejection', async () => {
  const error = Object.assign(new Error('Unexpected library failure'), {
    code: 400,
  })
  await expect(
    runTransactionWithRetries(
      async () => {
        throw error
      },
      8,
      {
        isExpectedError: isExpectedPerpTradeError,
      }
    )
  ).rejects.toBe(error)
  expect(log.error).toHaveBeenCalledTimes(1)
  expect(log.warn).not.toHaveBeenCalled()
})
