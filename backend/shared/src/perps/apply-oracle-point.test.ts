import { PerpContract } from 'common/contract'
import { notifyPerpOracleResult } from 'shared/notifications/perps'
import {
  createOracleFeedDispatcher,
  ORACLE_POLL_DEADLINE_MS,
} from 'shared/oracle-feed-dispatcher'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { applyOraclePointToLivePerps } from './apply-oracle-point'
import { runOracleUpdate } from './engine'
import { FAST_TICK_ORACLE_BOUNDS } from './oracle-tick-bounds'
import { publishPerpQuote } from './publish-perp-quote'

jest.mock('shared/notifications/perps', () => ({
  notifyPerpOracleResult: jest.fn(),
}))
jest.mock('./engine', () => ({ runOracleUpdate: jest.fn() }))
jest.mock('./publish-perp-quote', () => ({ publishPerpQuote: jest.fn() }))
jest.mock('shared/utils', () => ({
  log: Object.assign(jest.fn(), {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}))

const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const flush = async () => {
  for (let i = 0; i < 16; i++) await Promise.resolve()
}
const point = { ts: 2000, price: 101 }
const stored = {
  ts: new Date(point.ts).toISOString(),
  price: point.price,
  source_ts: null,
}
const result = {
  liquidated: [],
  adlAdjusted: [],
  adlSettled: [],
  adlFactorLong: 1,
  adlFactorShort: 1,
  poolLongBefore: 100,
  poolLongAfter: 100,
  poolShortBefore: 100,
  poolShortAfter: 100,
}
const setup = () => {
  const readPoint = jest.fn(async () => stored)
  const readContracts = jest.fn(async () =>
    ['first', 'second'].map((id) => ({
      data: {
        id,
        slug: id,
        oraclePrice: 100,
        oraclePriceTime: 1000,
        maxOraclePriceAgeMs: 120_000,
      } as PerpContract,
    }))
  )
  const pg = {
    oneOrNone: readPoint,
    manyOrNone: readContracts,
  } as unknown as SupabaseDirectClient
  const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  const dispatcher = createOracleFeedDispatcher(log)
  return { pg, readPoint, readContracts, dispatcher, log }
}

beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
  jest.mocked(runOracleUpdate).mockResolvedValue(result)
  jest.mocked(notifyPerpOracleResult).mockResolvedValue(undefined)
})
afterEach(() => {
  jest.clearAllTimers()
  jest.useRealTimers()
})

it('does not start the next database read when an abandoned lookup returns', async () => {
  const { pg, readPoint, readContracts, dispatcher, log } = setup()
  const pending = deferred<typeof stored>()
  readPoint.mockImplementationOnce(() => pending.promise)
  dispatcher.dispatch('btc', (progress) =>
    applyOraclePointToLivePerps(
      pg,
      'btc',
      point,
      FAST_TICK_ORACLE_BOUNDS,
      progress
    )
  )
  await flush()
  jest.advanceTimersByTime(ORACLE_POLL_DEADLINE_MS)
  pending.resolve(stored)
  await flush()
  expect(readContracts).not.toHaveBeenCalled()
  expect(runOracleUpdate).not.toHaveBeenCalled()
  expect(log.error).toHaveBeenCalledTimes(1)
  expect(log.error).toHaveBeenCalledWith(
    expect.stringContaining('apply:read-stored-point')
  )
})

it.each(['transaction', 'notification'])(
  'finishes a committed result after a slow %s, then stops before the next contract',
  async (phase) => {
    const { pg, dispatcher, log } = setup()
    const pending = deferred<void>()
    if (phase === 'transaction')
      jest.mocked(runOracleUpdate).mockImplementationOnce(async () => {
        await pending.promise
        return result
      })
    else
      jest
        .mocked(notifyPerpOracleResult)
        .mockImplementationOnce(() => pending.promise)
    dispatcher.dispatch('btc', (progress) =>
      applyOraclePointToLivePerps(
        pg,
        'btc',
        point,
        FAST_TICK_ORACLE_BOUNDS,
        progress
      )
    )
    await flush()
    jest.advanceTimersByTime(ORACLE_POLL_DEADLINE_MS)
    pending.resolve()
    await flush()
    expect(runOracleUpdate).toHaveBeenCalledTimes(1)
    expect(publishPerpQuote).toHaveBeenCalledTimes(1)
    expect(notifyPerpOracleResult).toHaveBeenCalledTimes(1)
    expect(log.error).toHaveBeenCalledTimes(1)
    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining(
        phase === 'transaction'
          ? 'apply:runOracleUpdate(first)'
          : 'apply:notify(first)'
      )
    )
  }
)

it('lets an unbounded publisher finish every contract', async () => {
  const { pg } = setup()
  await applyOraclePointToLivePerps(pg, 'btc', point)
  expect(runOracleUpdate).toHaveBeenCalledTimes(2)
  expect(notifyPerpOracleResult).toHaveBeenCalledTimes(2)
})
