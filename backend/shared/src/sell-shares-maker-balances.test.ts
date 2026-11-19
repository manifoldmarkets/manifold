const quietLog = () =>
  Object.assign(jest.fn(), {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  })
jest.mock('shared/monitoring/log', () => ({ log: quietLog() }))
jest.mock('shared/utils', () => ({
  log: quietLog(),
  contractColumnsToSelect: '*',
}))
jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(),
  SERIAL_MODE: {},
  pgp: {},
}))
jest.mock('shared/helpers/fn-queue', () => ({
  betsQueue: { enqueueFn: (fn: () => unknown) => fn() },
}))
jest.mock('shared/audit-events', () => ({
  trackPublicAuditBetEvent: jest.fn(),
}))
jest.mock('shared/helpers/auth', () => ({ throwErrorIfNotAdmin: jest.fn() }))
jest.mock('shared/helpers/user-contract-loans', () => ({
  getLoanTrackingRows: jest.fn(),
  upsertLoanTrackingQuery: jest.fn(),
}))
jest.mock('shared/helpers/user-contract-metrics', () => ({
  bulkUpdateUserMetricsWithNewBetsOnly: jest.fn(async () => []),
}))
jest.mock('shared/supabase/utils', () => ({ getInsertQuery: jest.fn() }))
jest.mock('shared/txn/run-txn', () => ({ txnToRow: jest.fn() }))
jest.mock('api/on-create-bet', () => ({ onCreateBets: jest.fn() }))
jest.mock('api/redeem-shares', () => ({ redeemShares: jest.fn() }))
jest.mock('api/place-bet', () => ({
  executeNewBetResult: jest.fn(async () => ({
    newBet: { amount: -3, shares: -10 },
    betId: 'sold',
  })),
}))
jest.mock('common/sell-bet', () => ({
  getCpmmSellBetInfo: jest.fn(),
  getCpmmMultiSellBetInfo: jest.fn(),
}))
jest.mock('api/helpers/bets', () => ({
  ...jest.requireActual('api/helpers/bets'),
  fetchContractBetDataAndValidate: jest.fn(),
  lockContractAndGetBetData: jest.fn(),
  getUserBalancesAndMetrics: jest.fn(),
}))

import {
  fetchContractBetDataAndValidate,
  getUserBalancesAndMetrics,
  lockContractAndGetBetData,
} from 'api/helpers/bets'
import { sellShares } from 'api/sell-shares'
import { getCpmmSellBetInfo } from 'common/sell-bet'
import { pick } from 'lodash'
import { createSupabaseDirectClient } from 'shared/supabase/init'

const mocked = <T extends (...args: any[]) => any>(fn: T) =>
  fn as unknown as jest.MockedFunction<T>

describe('sellShares and maker balances', () => {
  it('works the sale out in its transaction with the balances it was simulated with', async () => {
    // A maker left with a sliver, whose order the simulated sale matched
    // nothing against. The transaction read their balance with their order;
    // it used to work the sale out as if they had all they needed instead.
    const SPENT = 6.457834393110897e-15
    const contract = { id: 'market', slug: 'market', mechanism: 'cpmm-1' }
    const unfilledBets = [{ id: 'resting', userId: 'maker' }]
    const metric = {
      userId: 'seller',
      contractId: 'market',
      totalShares: { YES: 10 },
      loan: 0,
      marginLoan: 0,
    }
    const balances: Record<string, number> = { seller: 500, maker: SPENT }
    mocked(fetchContractBetDataAndValidate).mockResolvedValue({
      user: { id: 'seller', username: 'seller', balance: balances.seller },
      contract,
      answers: [],
      unfilledBets,
      balanceByUserId: { maker: SPENT },
      unfilledBetUserIds: ['maker'],
      contractMetrics: [metric],
    } as unknown as Awaited<ReturnType<typeof fetchContractBetDataAndValidate>>)
    mocked(lockContractAndGetBetData).mockResolvedValue({
      contract,
      answers: [],
      unfilledBets,
      balanceByUserId: { maker: SPENT },
      unfilledBetUserIds: ['maker'],
    } as unknown as Awaited<ReturnType<typeof lockContractAndGetBetData>>)
    // Only the users asked for, as the query does.
    mocked(getUserBalancesAndMetrics).mockImplementation(
      async (_pg, userIds) =>
        ({
          balanceByUserId: pick(balances, userIds),
          contractMetrics: [metric],
        } as unknown as Awaited<ReturnType<typeof getUserBalancesAndMetrics>>)
    )
    mocked(getCpmmSellBetInfo).mockReturnValue({
      newBet: { amount: -3, shares: -10, loanAmount: 0 },
      makers: [],
      ordersToCancel: [],
    } as unknown as ReturnType<typeof getCpmmSellBetInfo>)
    mocked(createSupabaseDirectClient).mockReturnValue({
      tx: async (_opts: unknown, fn: (t: unknown) => Promise<unknown>) =>
        fn({}),
    } as unknown as ReturnType<typeof createSupabaseDirectClient>)

    const response = await sellShares(
      { contractId: 'market', outcome: 'YES', shares: 10 },
      { uid: 'seller', creds: { kind: 'jwt' } } as Parameters<
        typeof sellShares
      >[1],
      {} as Parameters<typeof sellShares>[2]
    )

    expect(response).toMatchObject({ result: { betId: 'sold' } })
    // The simulation matched no maker, so only the seller's balance is read
    // again; the maker keeps the one read with their order.
    expect(mocked(getUserBalancesAndMetrics).mock.calls[0][1]).toEqual([
      'seller',
    ])
    const passes = mocked(getCpmmSellBetInfo).mock.calls
    expect(passes).toHaveLength(2)
    expect(passes[0][4]).toEqual({ maker: SPENT })
    expect(passes[1][4]).toEqual({ seller: 500, maker: SPENT })
  })
})
