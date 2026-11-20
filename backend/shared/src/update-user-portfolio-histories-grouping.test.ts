import * as calculations from 'common/calculate-metrics'
import { Contract, CPMMMultiContract } from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { convertAnswer, convertContract } from 'common/supabase/contracts'
import { Json } from 'common/supabase/schema'
import { Row } from 'common/supabase/utils'
import { SupabaseDirectClient } from './supabase/init'
import { getUnresolvedContractMetricsContractsAnswers } from './update-user-portfolio-histories-core'

// Exercise the real loader, row converters, SQL builder and financial calculator.
// Service boundaries fail closed: these tests cannot create a client or write.
jest.mock('./supabase/init', () => ({
  createSupabaseDirectClient: () => {
    throw new Error('Unexpected database client creation')
  },
  pgp: { as: { format: (query: string) => query } },
}))
jest.mock('./supabase/utils', () => ({
  bulkInsert: () => {
    throw new Error('Unexpected database write')
  },
}))
jest.mock('./utils', () => ({
  getUsers: () => {
    throw new Error('Unexpected user lookup')
  },
  isProd: () => false,
  log: Object.assign(jest.fn(), { error: jest.fn(), warn: jest.fn() }),
  prefixedContractColumnsToSelect: 'c.data, c.token, c.importance_score',
}))

type MetricRow = {
  data: Partial<ContractMetric>
  loan: number | null
  margin_loan: number | null
  is_ranked: boolean
}
type ContractRow = Parameters<typeof convertContract>[0]
type Results = [MetricRow[], ContractRow[], Row<'answers'>[]]

const metric = (
  id: number,
  contractId: string,
  userId: string,
  extra: Partial<ContractMetric> = {}
): ContractMetric => ({
  ...calculations.getDefaultMetric(userId, contractId, null),
  id,
  invested: 12,
  totalAmountInvested: 17,
  totalAmountSold: 5,
  totalShares: { YES: 20 + id, NO: 3 },
  totalSpent: { YES: 10, NO: 2 },
  profit: -2,
  loan: 3,
  marginLoan: 4,
  from: {
    day: {
      profit: 1,
      profitPercent: 10,
      invested: 10,
      prevValue: 10,
      value: 11,
    },
  },
  ...extra,
})

const row = (
  data: Partial<ContractMetric>,
  extra: Partial<MetricRow> = {}
): MetricRow => ({
  data,
  loan: null,
  margin_loan: null,
  is_ranked: true,
  ...extra,
})

const contractRow = (
  id: string,
  extra: Record<string, unknown> = {},
  token = 'MANA'
): ContractRow => ({
  data: {
    id,
    mechanism: 'cpmm-1',
    outcomeType: 'BINARY',
    prob: 0.25,
    isResolved: false,
    ...extra,
  } as Json,
  importance_score: 0,
  token,
})

const answerRow = (
  id: string,
  contractId: string,
  prob: number,
  index: number
) => ({ id, contract_id: contractId, prob, index } as Row<'answers'>)

const load = async (results: Results) => {
  const multi = jest.fn().mockResolvedValue(results)
  const pg = { multi } as unknown as SupabaseDirectClient
  const userIds = ['alice', 'bob', '10', '2']
  const loaded = await getUnresolvedContractMetricsContractsAnswers(pg, userIds)
  expect(multi).toHaveBeenCalledTimes(1)
  expect(multi).toHaveBeenCalledWith(expect.any(String), [userIds])
  return loaded
}

afterEach(() => jest.restoreAllMocks())

it('preserves ordered calculator inputs and exact financial results for interleaved users and market types', async () => {
  const answers = [
    answerRow('v2-b', 'multi-v2', 0.7, 1),
    answerRow('v1-a', 'multi-v1', 0.2, 0),
    answerRow('v2-a', 'multi-v2', 0.3, 0),
  ]
  const contracts = [
    contractRow('multi-v2', {
      mechanism: 'cpmm-multi-2',
      outcomeType: 'MULTIPLE_CHOICE',
      answers: [convertAnswer(answers[2]), convertAnswer(answers[0])],
    }),
    contractRow('mana'),
    contractRow('cash', {}, 'CASH'),
    contractRow('no-metrics'),
    contractRow('multi-v1', {
      mechanism: 'cpmm-multi-1',
      outcomeType: 'MULTIPLE_CHOICE',
      answers: [convertAnswer(answers[1])],
    }),
    contractRow('perp', { mechanism: 'perp', outcomeType: 'PERP' }),
    contractRow('cancelled', { resolution: 'CANCEL' }),
    // The SQL normally deduplicates contracts; mapping must still keep its order.
    contractRow('mana'),
  ]
  const duplicate = row(metric(4, 'multi-v2', 'alice', { answerId: 'v2-a' }))
  const results: Results = [
    [
      row(metric(1, 'mana', 'bob'), {
        loan: 0,
        margin_loan: 8,
        is_ranked: false,
      }),
      row(metric(2, 'cash', 'alice')),
      row(metric(3, 'multi-v1', 'bob', { answerId: 'v1-a' })),
      duplicate,
      row(metric(5, 'mana', 'alice')),
      row(metric(6, 'multi-v2', 'bob', { answerId: 'v2-b' })),
      row(metric(7, 'perp', 'alice', { payout: 123, profit: 11 })),
      duplicate,
      // First metric wins for a binary user; sorting/deduplicating changes this.
      row(metric(8, 'mana', 'bob', { totalShares: { YES: 999, NO: 0 } })),
      row(metric(9, 'orphan', 'alice')),
      row(metric(10, 'multi-v2', '10', { answerId: 'not-loaded' })),
      row(metric(11, 'multi-v2', '2', { answerId: 'v2-b' })),
      row(metric(12, 'cancelled', 'bob')),
      row({
        ...metric(13, 'cash', 'bob'),
        loan: undefined,
        marginLoan: undefined,
      }),
    ],
    contracts,
    answers,
  ]
  const originalRows = JSON.stringify(results)
  const calculate = jest.spyOn(
    calculations,
    'calculateUpdatedMetricsForContracts'
  )
  const loaded = await load(results)

  expect(calculate).toHaveBeenCalledTimes(1)
  // The previous association algorithm is the oracle; the financial code is real.
  const legacyInputs = loaded.contracts.map((contract) => ({
    contract,
    metrics: loaded.metrics.filter((m) => m.contractId === contract.id),
  }))
  expect(calculate.mock.calls[0]).toEqual([legacyInputs])
  calculate.mock.calls[0][0].forEach((entry, index) => {
    expect(entry.contract).toBe(loaded.contracts[index])
    entry.metrics.forEach((m, metricIndex) =>
      expect(m).toBe(legacyInputs[index].metrics[metricIndex])
    )
  })
  expect(loaded.updatedMetricsByContract).toStrictEqual(
    calculations.calculateUpdatedMetricsForContracts(legacyInputs)
      .metricsByContract
  )
  expect(loaded.contracts).toStrictEqual(
    contracts.map((c) => convertContract(c))
  )
  expect(loaded.answers).toStrictEqual(answers.map(convertAnswer))
  // The orphan (id 9) is dropped: its contract was not loaded, and the
  // consumers index contractsById and would throw on it. Everything else
  // keeps its row order.
  expect(loaded.metrics.map((m) => m.id)).toEqual(
    results[0].map((r) => r.data.id).filter((id) => id !== 9)
  )
  expect(loaded.metrics[0]).toMatchObject({
    loan: 0,
    marginLoan: 8,
    isRanked: false,
  })
  expect(loaded.metrics[1]).toMatchObject({ loan: 3, marginLoan: 4 })
  expect(loaded.metrics[12]).toMatchObject({ loan: 0, marginLoan: 0 })
  const { log } = jest.requireMock('./utils')
  expect(log.warn).toHaveBeenCalledTimes(1)
  expect(log.warn.mock.calls[0][0]).toContain(
    'Dropping 1 metric(s) and 0 answer(s)'
  )
  expect(loaded.updatedMetricsByContract['mana'][0]).toMatchObject({
    id: 1,
    payout: 7.5,
  })
  expect(loaded.updatedMetricsByContract['cash'][0]).toMatchObject({
    id: 2,
    payout: 7.75,
  })
  expect(loaded.updatedMetricsByContract['cancelled'][0]).toMatchObject({
    payout: 12,
    profit: 0,
  })
  expect(loaded.updatedMetricsByContract['perp'][0]).toMatchObject({
    payout: 123,
    profit: 11,
  })
  expect(loaded.updatedMetricsByContract['no-metrics']).toBeUndefined()
  expect(loaded.updatedMetricsByContract['orphan']).toBeUndefined()
  const multiSummary = loaded.updatedMetricsByContract['multi-v2'].find(
    (m) => m.userId === 'alice' && m.answerId === null
  )
  expect(multiSummary).toMatchObject({ loan: 6, marginLoan: 8, invested: 24 })
  expect(
    (loaded.contracts[0] as CPMMMultiContract).answers.map((a) => a.id)
  ).toEqual(['v2-a', 'v2-b'])
  expect(JSON.stringify(results)).toBe(originalRows)
})

it('returns the existing empty result and skips calculation when no metrics were loaded', async () => {
  const calculate = jest.spyOn(
    calculations,
    'calculateUpdatedMetricsForContracts'
  )
  expect(
    await load([[], [contractRow('empty')], [answerRow('a', 'empty', 0.5, 0)]])
  ).toStrictEqual({
    metrics: [],
    contracts: [],
    answers: [],
    updatedMetricsByContract: {},
  })
  expect(calculate).not.toHaveBeenCalled()
})

it('drops a metric whose contract was not loaded, and logs it', async () => {
  // Before the repeatable-read snapshot, a market resolving between the
  // metrics and contracts statements produced exactly this shape and crashed
  // getUnresolvedStatsForToken reading `.token` of undefined.
  const calculate = jest.spyOn(
    calculations,
    'calculateUpdatedMetricsForContracts'
  )
  const loaded = await load([[row(metric(1, 'orphan', 'alice'))], [], []])
  expect(loaded.metrics).toHaveLength(0)
  expect(loaded.contracts).toEqual([])
  expect(loaded.updatedMetricsByContract).toEqual({})
  expect(calculate).not.toHaveBeenCalled()
  const { log } = jest.requireMock('./utils')
  expect(log.warn).toHaveBeenCalledWith(
    expect.stringContaining('Dropping 1 metric(s) and 0 answer(s)'),
    { contractIds: ['orphan'] }
  )
})

it('treats absent inherited-name buckets as empty arrays', async () => {
  const calculate = jest.spyOn(
    calculations,
    'calculateUpdatedMetricsForContracts'
  )
  const ids = [
    'constructor',
    'toString',
    '__proto__',
    'present.length',
    'present',
  ]
  const loaded = await load([
    [row(metric(1, 'present', 'alice'))],
    ids.map((id) => contractRow(id)),
    [],
  ])
  expect(calculate.mock.calls[0][0].slice(0, 4).map((c) => c.metrics)).toEqual([
    [],
    [],
    [],
    [],
  ])
  expect(Object.keys(loaded.updatedMetricsByContract)).toEqual(['present'])
  expect(loaded.updatedMetricsByContract['present'][0]).toMatchObject({ id: 1 })
})

it('matches the old filter across deterministic shuffled contracts and metric rows', async () => {
  const calculate = jest.spyOn(
    calculations,
    'calculateUpdatedMetricsForContracts'
  )
  const contracts = Array.from({ length: 41 }, (_, i) =>
    contractRow(`c${(i * 17) % 41}`)
  )
  const rows = Array.from({ length: 500 }, (_, i) =>
    row(metric(i, `c${(i * 13) % 43}`, `u${i % 7}`))
  )
  const loaded = await load([rows, contracts, []])
  const legacyInputs = loaded.contracts.map((contract: Contract) => ({
    contract,
    metrics: loaded.metrics.filter((m) => m.contractId === contract.id),
  }))
  expect(calculate.mock.calls[0]).toEqual([legacyInputs])
  expect(loaded.updatedMetricsByContract).toStrictEqual(
    calculations.calculateUpdatedMetricsForContracts(legacyInputs)
      .metricsByContract
  )
})
