jest.mock('shared/utils', () => ({
  getContractSupabase: jest.fn(),
  isProd: () => false,
}))
jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(),
}))
jest.mock('shared/transact-with-retries', () => ({
  runTransactionWithRetries: jest.fn(),
}))
jest.mock('shared/supabase/contracts', () => ({ updateContract: jest.fn() }))
jest.mock('shared/supabase/liquidity', () => ({ insertLiquidity: jest.fn() }))
jest.mock('shared/websockets/helpers', () => ({
  broadcastNewAnswer: jest.fn(),
  broadcastUpdatedAnswers: jest.fn(),
}))

import { DEV_HOUSE_LIQUIDITY_PROVIDER_ID } from 'common/antes'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateContract } from 'shared/supabase/contracts'
import { insertLiquidity } from 'shared/supabase/liquidity'
import { runTransactionWithRetries } from 'shared/transact-with-retries'
import { getContractSupabase } from 'shared/utils'
import { broadcastUpdatedAnswers } from 'shared/websockets/helpers'
import { addHouseSubsidy } from './add-house-subsidy'

type AnswerRow = {
  id: string
  index: number
  contract_id: string
  created_time: string
  pool_yes: number
  pool_no: number
  total_liquidity: number
  subsidy_pool: number
  resolution: string | null
}

const answerRow = (id: string, index: number, resolution: string | null) =>
  ({
    id,
    index,
    contract_id: 'M',
    created_time: '2026-01-01T00:00:00Z',
    pool_yes: 100,
    pool_no: 100,
    total_liquidity: 50,
    subsidy_pool: 0,
    resolution,
  } as AnswerRow)

// The market's row lock, and the two statements addSubsidyToOpenAnswers runs.
const fakeTx = (answers: AnswerRow[]) => ({
  oneOrNone: jest.fn(async (sql: string) => {
    if (/from contracts where id = \$1 for update/.test(sql)) return {}
    throw new Error(`unexpected: ${sql}`)
  }),
  map: jest.fn(
    async (sql: string, params: unknown[], cb: (r: any) => unknown) => {
      if (/select id from answers/.test(sql))
        return answers
          .filter((a) => a.resolution === null)
          .map((a) => cb({ id: a.id }))
      if (/update answers/.test(sql)) {
        const [share, ids] = params as [number, string[]]
        const updated = answers.filter((a) => ids.includes(a.id))
        for (const a of updated) {
          a.subsidy_pool += share
          a.total_liquidity += share
        }
        return updated.map((a) => cb({ ...a }))
      }
      throw new Error(`unexpected: ${sql}`)
    }
  ),
})

const run = async (contract: Record<string, unknown>, answers: AnswerRow[]) => {
  const tx = fakeTx(answers)
  ;(runTransactionWithRetries as jest.Mock).mockImplementation(
    (fn: (t: typeof tx) => unknown) => fn(tx)
  )
  ;(createSupabaseDirectClient as jest.Mock).mockReturnValue({
    tx: (fn: (t: typeof tx) => unknown) => fn(tx),
  })
  ;(getContractSupabase as jest.Mock).mockResolvedValue({
    id: 'M',
    outcomeType: 'MULTIPLE_CHOICE',
    answers: [],
    ...contract,
  })
  await addHouseSubsidy('M', 60)
}

const insertedProvisions = () =>
  (insertLiquidity as jest.Mock).mock.calls.map(([, lp]) => lp)
const contractUpdates = () =>
  (updateContract as jest.Mock).mock.calls.map(([, , update]) => update)

beforeEach(() => jest.clearAllMocks())

describe("the house's liquidity for a boost", () => {
  it("goes to an independent market's open answers in equal shares", async () => {
    const answers = [
      answerRow('A', 0, null),
      answerRow('B', 1, 'YES'),
      answerRow('C', 2, null),
    ]
    await run(
      { mechanism: 'cpmm-multi-1', shouldAnswersSumToOne: false },
      answers
    )

    expect(answers.map((a) => a.subsidy_pool)).toEqual([30, 0, 30])
    expect(insertedProvisions()).toEqual([
      expect.objectContaining({
        userId: DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
        amount: 60,
        answerIds: ['A', 'C'],
      }),
    ])
    expect(insertedProvisions()[0].answerId).toBeUndefined()
    expect(contractUpdates()).toHaveLength(1)
    expect(Object.keys(contractUpdates()[0])).toEqual(['totalLiquidity'])
    expect(broadcastUpdatedAnswers).toHaveBeenCalledTimes(1)
  })

  it('adds nothing once every answer has resolved', async () => {
    const answers = [answerRow('A', 0, 'YES'), answerRow('B', 1, 'NO')]
    await run(
      { mechanism: 'cpmm-multi-1', shouldAnswersSumToOne: false },
      answers
    )

    expect(insertLiquidity).not.toHaveBeenCalled()
    expect(updateContract).not.toHaveBeenCalled()
    expect(broadcastUpdatedAnswers).not.toHaveBeenCalled()
  })

  it("stays with a binary market's own pending subsidy", async () => {
    await run({ mechanism: 'cpmm-1', outcomeType: 'BINARY', pool: {} }, [])

    expect(insertedProvisions()[0].answerIds).toBeUndefined()
    expect(Object.keys(contractUpdates()[0]).sort()).toEqual([
      'subsidyPool',
      'totalLiquidity',
    ])
  })
})
