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

it("stamps a shared snapshot from its starting caller's clock, read before the RPC", async () => {
  let now = 1_900_000_000_000
  jest.spyOn(Date, 'now').mockImplementation(() => now)
  const order: string[] = []
  jest.mocked(getMultipleAccounts).mockImplementation(async (addresses) => {
    order.push('rpc')
    return {
      slot: 1,
      accounts: addresses.map(() => ({
        owner: 'pool',
        data: new Uint8Array(),
      })),
    }
  })
  try {
    const clock = async () => {
      order.push('clock')
      return 1_234
    }
    expect(await fetchXStockUsdPrice(XSTOCK_SPECS.SPYX, clock)).toEqual({
      ts: 1_234,
      price: 100,
    })
    expect(order).toEqual(['clock', 'rpc'])
    const sharer = jest.fn(async () => 9_999)
    expect(await fetchXStockUsdPrice(XSTOCK_SPECS.QQQX, sharer)).toEqual({
      ts: 1_234,
      price: 100,
    })
    expect(sharer).not.toHaveBeenCalled()
    // A failed clock read fails the poll without sampling at all.
    now += 2_000
    await expect(
      fetchXStockUsdPrice(XSTOCK_SPECS.GLDX, async () => {
        throw new Error('database unavailable')
      })
    ).rejects.toThrow('database unavailable')
    expect(order).toEqual(['clock', 'rpc'])
  } finally {
    jest.restoreAllMocks()
  }
})
