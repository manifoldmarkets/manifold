import { API } from '../api/schema'
import { PerpContract } from '../contract'
import { HOUR_MS, YEAR_MS } from '../util/time'
import { buildMnxRulePatch, MnxBatch, runMnxBatch } from './mnx-management'
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

const batch = (): MnxBatch => ({
  version: 1,
  actorId: 'mnx',
  createdAt: 1,
  items: ['a', 'b', 'c'].map((id) => ({
    kind: 'liquidity',
    title: id,
    status: 'pending',
    params: {
      contractId: id,
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
