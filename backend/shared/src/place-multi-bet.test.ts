const quietLog = () =>
  Object.assign(jest.fn(), {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  })
jest.mock('shared/monitoring/log', () => ({ log: quietLog() }))
jest.mock('shared/utils', () => ({ log: quietLog() }))
jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(),
  SERIAL_MODE: {},
}))
jest.mock('api/helpers/bets', () => ({
  fetchContractBetDataAndValidate: jest.fn(),
  getRoundedLimitProb: jest.fn(),
}))
jest.mock('api/on-create-bet', () => ({ onCreateBets: jest.fn() }))
jest.mock('api/place-bet', () => ({ executeNewBetResult: jest.fn() }))

import { fetchContractBetDataAndValidate } from 'api/helpers/bets'
import { placeMultiBetMain } from 'api/place-multi-bet'
import { createSupabaseDirectClient } from 'shared/supabase/init'

const mocked = <T extends (...args: any[]) => any>(fn: T) =>
  fn as unknown as jest.MockedFunction<T>

describe('placeMultiBetMain', () => {
  it('locks the contract row before reading anything', async () => {
    // Adding an answer runs at READ COMMITTED and cancels Other's open orders
    // under this lock; a zero-fill limit order only inserts its bet, so it
    // must wait for the lock before reading the market it prices against.
    const trans = { any: jest.fn(async () => [{ '?column?': 1 }]) }
    mocked(createSupabaseDirectClient).mockReturnValue({
      tx: async (_opts: unknown, fn: (t: typeof trans) => Promise<unknown>) =>
        fn(trans),
    } as any)
    const stop = new Error('stop after the reads')
    mocked(fetchContractBetDataAndValidate).mockRejectedValue(stop)

    await expect(
      placeMultiBetMain(
        {
          contractId: 'c1',
          answerIds: ['a', 'b'],
          amount: 10,
        } as Parameters<typeof placeMultiBetMain>[0],
        'u1',
        false
      )
    ).rejects.toBe(stop)

    expect(trans.any).toHaveBeenCalledTimes(1)
    expect(trans.any).toHaveBeenCalledWith(
      'select 1 from contracts where id = $1 for update',
      ['c1']
    )
    expect(trans.any.mock.invocationCallOrder[0]).toBeLessThan(
      mocked(fetchContractBetDataAndValidate).mock.invocationCallOrder[0]
    )
    expect(mocked(fetchContractBetDataAndValidate).mock.calls[0][0]).toBe(trans)
  })
})
