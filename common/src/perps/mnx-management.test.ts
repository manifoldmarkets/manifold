import { API } from '../api/schema'
import { PerpContract } from '../contract'
import { HOUR_MS, YEAR_MS } from '../util/time'
import {
  buildMnxRulePatch,
  isMnxBatchInProgress,
  MNX_BATCH_STALE_MS,
  MnxBatch,
  MnxBatchStorage,
  readMnxBatches,
  removeMnxBatch,
  runMnxBatch,
  saveMnxBatch,
} from './mnx-management'
import { MNX_DEFAULT_FEES } from './mnx'

const contract = { fundingPeriodMs: HOUR_MS } as PerpContract

it('converts an annual funding percentage separately for each market period', () => {
  expect(buildMnxRulePatch({ annualFunding: '100' }, contract)).toEqual({
    maxFundingRate: HOUR_MS / YEAR_MS,
  })
  expect(
    buildMnxRulePatch(
      { annualFunding: '100' },
      { ...contract, fundingPeriodMs: 24 * HOUR_MS }
    )
  ).toEqual({ maxFundingRate: (24 * HOUR_MS) / YEAR_MS })
})

it('leaves blank fields unchanged but preserves explicit zero fees', () => {
  expect(
    buildMnxRulePatch({ takerFeeBps: '0', maxLeverage: ' ' }, contract)
  ).toEqual({ takerFeeBps: 0 })
  expect(() => buildMnxRulePatch({}, contract)).toThrow('at least one')
  expect(buildMnxRulePatch({ oracleAgeSeconds: '4500' }, contract)).toEqual({
    maxOraclePriceAgeMs: 4_500_000,
  })
})

it('rounds a fractional mark age to whole milliseconds', () => {
  // 1.005 * 1000 is 1004.9999999999999 in floating point.
  expect(buildMnxRulePatch({ oracleAgeSeconds: '1.005' }, contract)).toEqual({
    maxOraclePriceAgeMs: 1005,
  })
})

it.each([
  { maxLeverage: '1' },
  { annualFunding: '0' },
  { takerFeeApiBps: '301' },
  { takerFeeImpact: 'Infinity' },
  { fundingSensitivity: '0' },
])('rejects invalid rules %j before making a preview', (form) => {
  expect(() => buildMnxRulePatch(form, contract)).toThrow()
})

it('allows each rule independently and rejects an empty update or client-only fields', () => {
  const shape = API['update-perp-config'].props
  for (const patch of [
    { ...MNX_DEFAULT_FEES },
    { maxLeverage: 3 },
    { fundingSensitivity: 1 },
    { maxFundingRate: 0.001 },
    { maxOraclePriceAgeMs: 4500000 },
  ])
    expect(shape.safeParse({ contractId: 'c', ...patch }).success).toBe(true)
  expect(shape.safeParse({ contractId: 'c' }).success).toBe(false)
  expect(
    shape.safeParse({ contractId: 'c', maxLeverage: 3, creatorId: 'attacker' })
      .success
  ).toBe(false)
})

const batch = (id = 'batch1'): MnxBatch => ({
  version: 2,
  id,
  actorId: 'mnx',
  createdAt: 1,
  items: ['a', 'b', 'c'].map((contractId) => ({
    kind: 'liquidity',
    title: contractId,
    status: 'pending',
    params: {
      contractId,
      side: 'both',
      amount: 10,
      idempotencyKey: 'abcdefghjk',
    },
  })),
})

it('stops at a lost response, then skips successes and retries with the SAME payment key', async () => {
  const saved: MnxBatch[] = []
  const save = (b: MnxBatch) => {
    saved.push(b)
  }
  const send = jest
    .fn()
    .mockResolvedValueOnce({})
    .mockRejectedValueOnce(new Error('Lost response'))
  const first = await runMnxBatch(batch(), save, send, () => true)
  expect(first.items.map((i) => i.status)).toEqual(['done', 'error', 'pending'])
  expect(saved[0].items.map((i) => i.status)).toEqual([
    'pending',
    'pending',
    'pending',
  ])
  const retry = jest.fn().mockResolvedValue({})
  const last = await runMnxBatch(
    JSON.parse(JSON.stringify(first)),
    save,
    retry,
    () => true
  )
  expect(retry.mock.calls.map(([item]) => item.params.contractId)).toEqual([
    'b',
    'c',
  ])
  expect(retry.mock.calls[0][0].params.idempotencyKey).toBe(
    send.mock.calls[1][0].params.idempotencyKey
  )
  expect(last.items.every((i) => i.status === 'done')).toBe(true)
})

it('sends no payment if saving the retry keys fails or the account unmounts', async () => {
  const send = jest.fn()
  await expect(
    runMnxBatch(
      batch(),
      () => {
        throw new Error('Storage full')
      },
      send,
      () => true
    )
  ).rejects.toThrow('Storage full')
  await runMnxBatch(batch(), jest.fn(), send, () => false)
  expect(send).not.toHaveBeenCalled()
})

it('marks the batch in progress for other tabs while sending and clears it when the run ends', async () => {
  const saved: MnxBatch[] = []
  const send = jest
    .fn()
    .mockResolvedValueOnce({})
    .mockRejectedValueOnce(new Error('Lost response'))
  const last = await runMnxBatch(
    batch(),
    (b) => {
      saved.push(b)
    },
    send,
    () => true
  )
  const during = saved.slice(0, -1)
  expect(during.length).toBeGreaterThan(0)
  expect(during.every((b) => isMnxBatchInProgress(b, b.runningAt!))).toBe(true)
  expect(last.runningAt).toBeUndefined()
  expect(saved[saved.length - 1]).toEqual(last)
  // A tab that crashed mid-run stops blocking the others once its mark is stale.
  const crashed = { ...last, runningAt: 1_000_000 }
  expect(
    isMnxBatchInProgress(crashed, 1_000_000 + MNX_BATCH_STALE_MS - 1)
  ).toBe(true)
  expect(isMnxBatchInProgress(crashed, 1_000_000 + MNX_BATCH_STALE_MS)).toBe(
    false
  )
})

const fakeStorage = (): MnxBatchStorage => {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value)
    },
    removeItem: (key) => {
      map.delete(key)
    },
  }
}

it('saves every batch under its own entry, so finishing one never discards another', () => {
  const storage = fakeStorage()
  saveMnxBatch(storage, 'DEV', { ...batch('newer'), createdAt: 2 })
  saveMnxBatch(storage, 'DEV', batch('older'))
  saveMnxBatch(storage, 'PROD', batch('other-env'))
  saveMnxBatch(storage, 'DEV', { ...batch('other-account'), actorId: 'admin' })
  expect(readMnxBatches(storage, 'DEV', 'mnx').map((b) => b.id)).toEqual([
    'older',
    'newer',
  ])
  removeMnxBatch(storage, 'DEV', batch('newer'))
  expect(readMnxBatches(storage, 'DEV', 'mnx').map((b) => b.id)).toEqual([
    'older',
  ])
  expect(readMnxBatches(storage, 'PROD', 'mnx').map((b) => b.id)).toEqual([
    'other-env',
  ])
  expect(readMnxBatches(storage, 'DEV', 'admin').map((b) => b.id)).toEqual([
    'other-account',
  ])
})

it('refuses to start over a saved batch it cannot read', () => {
  const storage = fakeStorage()
  saveMnxBatch(storage, 'DEV', batch())
  storage.setItem('mnx-batch-v2:DEV:mnx:legacy', '{"version":1,"items":[]}')
  expect(() => readMnxBatches(storage, 'DEV', 'mnx')).toThrow(
    'could not be read'
  )
})
