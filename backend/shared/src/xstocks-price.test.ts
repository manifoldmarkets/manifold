import { getMultipleAccounts } from './solana-rpc'
import { fetchXStockUsdPrice, XSTOCK_SPECS } from './xstocks-price'

jest.mock('./solana-rpc', () => ({ getMultipleAccounts: jest.fn() }))
jest.mock('common/perps/solana-pools', () => ({
  readPoolSpotPrice: () => 100,
}))
jest.mock('./utils', () => ({
  log: Object.assign(jest.fn(), { error: jest.fn() }),
}))

it('retains sampling time through a slow response and across shared snapshots', async () => {
  let now = 1_800_000_000_000
  const startedAt = now
  jest.spyOn(Date, 'now').mockImplementation(() => now)
  jest.mocked(getMultipleAccounts).mockImplementation(async (addresses) => {
    now += 200
    return {
      slot: 1,
      accounts: addresses.map(() => ({
        owner: 'pool',
        data: new Uint8Array(),
      })),
    }
  })
  try {
    expect(await fetchXStockUsdPrice(XSTOCK_SPECS.SPYX)).toEqual({
      ts: startedAt,
      price: 100,
    })
    now += 100
    expect(await fetchXStockUsdPrice(XSTOCK_SPECS.QQQX)).toEqual({
      ts: startedAt,
      price: 100,
    })
    expect(getMultipleAccounts).toHaveBeenCalledTimes(1)
    now = startedAt + 2000
    expect(await fetchXStockUsdPrice(XSTOCK_SPECS.GLDX)).toEqual({
      ts: startedAt + 2000,
      price: 100,
    })
    expect(getMultipleAccounts).toHaveBeenCalledTimes(2)
  } finally {
    jest.restoreAllMocks()
  }
})
