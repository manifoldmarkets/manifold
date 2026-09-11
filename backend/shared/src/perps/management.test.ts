import { PerpContract } from 'common/contract'
import { ENV, ENV_CONFIG } from 'common/envs/constants'
import { MNX_CREATOR_IDS } from 'common/perps/creator-accounts'
import { getPerpConfig } from 'common/perps/management'
import { fetchMnxSnapshot, requireMnxReady } from 'shared/mnx'
import {
  createSupabaseDirectClient,
  SupabaseTransaction,
} from 'shared/supabase/init'
import { runTransactionWithRetries } from 'shared/transact-with-retries'
import { runTxnOutsideBetQueue } from 'shared/txn/run-txn'
import { getContract } from 'shared/utils'
import { addPerpPoolSubsidy } from './engine'
import { setPerpConfig } from './manage-config'
import { requirePerpManager } from './management-auth'

jest.mock('shared/utils', () => ({
  log: Object.assign(jest.fn(), { error: jest.fn(), warn: jest.fn() }),
  getContract: jest.fn(),
}))
jest.mock('shared/transact-with-retries', () => ({
  runTransactionWithRetries: jest.fn(),
}))
jest.mock('shared/txn/run-txn', () => ({ runTxnOutsideBetQueue: jest.fn() }))
jest.mock('shared/mnx', () => ({
  fetchMnxSnapshot: jest.fn(),
  requireMnxReady: jest.fn(),
}))
jest.mock('shared/oracle-feeds', () => ({
  getOracleFeed: () => ({}),
  getMinTradingMarkAgeMs: () => 120_000,
}))
jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(),
  pgp: jest.requireActual('pg-promise')(),
}))
jest.mock('./queries', () => ({
  ...jest.requireActual('./queries'),
  advisoryLockQuery: (id: string) => `lock:${id}`,
  selectContractForUpdateQuery: (id: string) => `contract:${id}`,
  selectPositionsForUpdateQuery: (id: string) => `positions:${id}`,
  mergeContractDataQuery: (_id: string, patch: unknown) => ({ patch }),
}))

const mnx = 'mnx-test'
const ids = { ...MNX_CREATOR_IDS }
let contract: PerpContract
let balance: number
let ledger: number
let receipts: { amount: number; side: string; key: string }[]
let locked: boolean
const tx = {
  one: jest.fn(),
  oneOrNone: jest.fn(),
  any: jest.fn(),
  none: jest.fn(),
} as unknown as SupabaseTransaction

beforeEach(() => {
  jest.clearAllMocks()
  MNX_CREATOR_IDS[ENV] = mnx
  balance = 1000
  ledger = 200
  receipts = []
  locked = false
  contract = {
    id: 'c1',
    creatorId: mnx,
    mechanism: 'perp',
    token: 'MANA',
    oracleFeedId: 'mnx-openai-mark',
    slug: 'mnx-openai',
    poolLong: 100,
    poolShort: 100,
    maxLeverage: 3,
    maxFundingRate: 0.001,
    fundingSensitivity: 1,
    maxOraclePriceAgeMs: 300000,
    takerFeeBps: 10,
    takerFeeApiBps: 30,
    takerFeeImpact: 10,
  } as PerpContract
  jest
    .mocked(createSupabaseDirectClient)
    .mockReturnValue(
      tx as unknown as ReturnType<typeof createSupabaseDirectClient>
    )
  jest.mocked(getContract).mockImplementation(async () => contract)
  jest
    .mocked(runTransactionWithRetries)
    .mockImplementation(async (fn) => fn(tx))
  jest
    .mocked(fetchMnxSnapshot)
    .mockResolvedValue({ fetchedAt: Date.now(), feeds: {}, markets: [] })
  jest
    .mocked(requireMnxReady)
    .mockReturnValue({ supportedLeverage: 4 } as ReturnType<
      typeof requireMnxReady
    >)
  jest.mocked(tx.any).mockResolvedValue([])
  jest.mocked(tx.one).mockImplementation(async (query: any) => {
    if (typeof query === 'string' && query.startsWith('lock:')) {
      locked = true
      return {}
    }
    if (query.patch) {
      expect(locked).toBe(true)
      contract = { ...contract, ...query.patch }
      return {}
    }
    if (query.includes('as balance')) return { balance: ledger }
    throw new Error(`Unexpected query ${query}`)
  })
  jest
    .mocked(tx.oneOrNone)
    .mockImplementation(async (query: any, values: any, convert?: any) => {
      if (
        query.startsWith('contract:') ||
        query.startsWith('select * from contracts')
      ) {
        expect(locked).toBe(true)
        const row = { data: contract, token: contract.token }
        return convert ? convert(row) : row
      }
      if (query.includes('from users')) {
        const row = { id: values[0], username: 'RenamedMNX', balance, data: {} }
        return convert ? convert(row) : row
      }
      if (query.includes('from txns'))
        return receipts.find((r) => r.key === values[2]) ?? null
      throw new Error(`Unexpected query ${query}`)
    })
  jest.mocked(runTxnOutsideBetQueue).mockImplementation(async (_tx, txn) => {
    expect(locked).toBe(true)
    balance -= txn.amount
    ledger += txn.amount
    receipts.push({
      amount: txn.amount,
      side: txn.data!.side,
      key: txn.data!.idempotencyKey,
    })
    return {} as Awaited<ReturnType<typeof runTxnOutsideBetQueue>>
  })
})
afterEach(() => Object.assign(MNX_CREATOR_IDS, ids))

const authorize = async (pg: SupabaseTransaction, c: PerpContract) => {
  await requirePerpManager(pg, mnx, c)
}
const options = { idempotencyKey: 'abcdefghjk', authorize }

it('funds both sides in one transaction and debits the combined cost exactly once', async () => {
  expect(
    await addPerpPoolSubsidy('c1', mnx, 'both', 50, options)
  ).toMatchObject({ poolLong: 150, poolShort: 150 })
  expect(balance).toBe(900)
  expect(ledger).toBe(300)
  expect(runTxnOutsideBetQueue).toHaveBeenCalledTimes(1)
  await addPerpPoolSubsidy('c1', mnx, 'both', 50, options)
  expect(balance).toBe(900)
  expect(runTxnOutsideBetQueue).toHaveBeenCalledTimes(1)
})

it.each(['long', 'short'] as const)(
  'still supports a %s-only contribution',
  async (side) => {
    await addPerpPoolSubsidy('c1', mnx, side, 50, options)
    expect(contract.poolLong).toBe(side === 'long' ? 150 : 100)
    expect(contract.poolShort).toBe(side === 'short' ? 150 : 100)
    expect(balance).toBe(950)
  }
)

it('checks the combined balance and ownership under the contract lock before paying', async () => {
  balance = 75
  await expect(
    addPerpPoolSubsidy('c1', mnx, 'both', 50, options)
  ).rejects.toThrow('Insufficient balance')
  balance = 1000
  contract.creatorId = 'different-owner'
  await expect(
    addPerpPoolSubsidy('c1', mnx, 'both', 50, options)
  ).rejects.toThrow('Only admins')
  expect(runTxnOutsideBetQueue).not.toHaveBeenCalled()
})

it('rejects a reused key with a different amount or side', async () => {
  await addPerpPoolSubsidy('c1', mnx, 'both', 50, options)
  await expect(
    addPerpPoolSubsidy('c1', mnx, 'both', 60, options)
  ).rejects.toThrow('different amount or side')
  await expect(
    addPerpPoolSubsidy('c1', mnx, 'long', 100, options)
  ).rejects.toThrow('different amount or side')
  expect(runTxnOutsideBetQueue).toHaveBeenCalledTimes(1)
})

it('recovers a committed payment after settlement, while refusing new payments to resolved markets', async () => {
  await addPerpPoolSubsidy('c1', mnx, 'both', 50, options)
  contract.isResolved = true
  balance = 0
  await expect(
    addPerpPoolSubsidy('c1', mnx, 'both', 50, options)
  ).resolves.toMatchObject({ poolLong: 150 })
  await expect(
    addPerpPoolSubsidy('c1', mnx, 'both', 50, {
      ...options,
      idempotencyKey: 'abcdefghjm',
    })
  ).rejects.toThrow('resolved')
  expect(runTxnOutsideBetQueue).toHaveBeenCalledTimes(1)
})

it('fails closed on escrow mismatch and does not debit the manager', async () => {
  ledger = 0
  await expect(
    addPerpPoolSubsidy('c1', mnx, 'long', 50, options)
  ).rejects.toThrow('escrow invariant')
  expect(runTxnOutsideBetQueue).not.toHaveBeenCalled()
})

it('updates the partner rules with an audit record inside the same transaction', async () => {
  const expectedConfig = getPerpConfig(contract)
  const result = await setPerpConfig(
    {
      contractId: 'c1',
      takerFeeApiBps: 20,
      fundingSensitivity: 2,
      expectedConfig,
    },
    mnx
  )
  expect(result.takerFeeApiBps).toBe(20)
  expect(result.fundingSensitivity).toBe(2)
  expect(tx.none).toHaveBeenCalledWith(
    expect.stringContaining('insert into contract_edits'),
    expect.arrayContaining(['c1', mnx])
  )
  // Lost response: the exact desired config is already present.
  await setPerpConfig(
    {
      contractId: 'c1',
      takerFeeApiBps: 20,
      fundingSensitivity: 2,
      expectedConfig,
    },
    mnx
  )
  expect(tx.none).toHaveBeenCalledTimes(1)
})

it('refuses a stale preview without overwriting another operator', async () => {
  const expectedConfig = getPerpConfig(contract)
  contract.takerFeeBps = 15
  await expect(
    setPerpConfig({ contractId: 'c1', takerFeeApiBps: 20, expectedConfig }, mnx)
  ).rejects.toThrow('changed since this preview')
  expect(tx.none).not.toHaveBeenCalled()
})

it('preserves provider limits and refuses freshness settings below the cadence floor', async () => {
  await expect(
    setPerpConfig({ contractId: 'c1', maxLeverage: 5 }, mnx)
  ).rejects.toThrow('at most 4x')
  await expect(
    setPerpConfig({ contractId: 'c1', maxOraclePriceAgeMs: 1000 }, mnx)
  ).rejects.toThrow('at least 120')
  expect(tx.none).not.toHaveBeenCalled()
})

it('can reduce leverage during an MNX outage and keeps admin access to other perps', async () => {
  jest.mocked(fetchMnxSnapshot).mockRejectedValue(new Error('provider offline'))
  await expect(
    setPerpConfig({ contractId: 'c1', maxLeverage: 2 }, mnx)
  ).resolves.toMatchObject({ maxLeverage: 2 })
  expect(fetchMnxSnapshot).not.toHaveBeenCalled()
  contract.oracleFeedId = 'btc-usd'
  contract.creatorId = 'house'
  await expect(
    setPerpConfig(
      { contractId: 'c1', takerFeeApiBps: 20 },
      ENV_CONFIG.adminIds[0]
    )
  ).resolves.toMatchObject({ takerFeeApiBps: 20 })
  await expect(
    setPerpConfig({ contractId: 'c1', takerFeeApiBps: 30 }, mnx)
  ).rejects.toThrow('Only admins')
})

it('refuses account switches and resolved-market rule edits', async () => {
  await expect(
    setPerpConfig(
      { contractId: 'c1', maxLeverage: 2, expectedManagerId: 'other' },
      mnx
    )
  ).rejects.toThrow('signed-in account changed')
  contract.isResolved = true
  await expect(
    setPerpConfig({ contractId: 'c1', maxLeverage: 2 }, mnx)
  ).rejects.toThrow('resolved')
  expect(tx.none).not.toHaveBeenCalled()
})
