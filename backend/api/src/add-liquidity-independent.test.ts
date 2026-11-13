jest.mock('api/helpers/endpoint', () => ({
  APIError: jest.requireActual('common/api/utils').APIError,
}))
jest.mock('api/helpers/rate-limit', () => ({
  onlyUsersWhoCanPerformAction: (_: string, fn: unknown) => fn,
}))
jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(),
}))
jest.mock('shared/utils', () => ({
  getContract: jest.fn(),
  getUser: jest.fn(),
  log: jest.fn(),
}))
jest.mock('shared/transact-with-retries', () => ({
  runTransactionWithRetries: jest.fn(),
}))
jest.mock('shared/txn/run-txn', () => ({ runTxnInBetQueue: jest.fn() }))
jest.mock('shared/supabase/contracts', () => ({ updateContract: jest.fn() }))
jest.mock('shared/supabase/liquidity', () => ({ insertLiquidity: jest.fn() }))
jest.mock('shared/websockets/helpers', () => ({
  broadcastNewAnswer: jest.fn(),
  broadcastUpdatedAnswers: jest.fn(),
}))
jest.mock('./on-update-liquidity-provision', () => ({
  onCreateLiquidityProvision: jest.fn(),
}))

import { LiquidityProvision } from 'common/liquidity-provision'
import { getContract, getUser } from 'shared/utils'
import { runTransactionWithRetries } from 'shared/transact-with-retries'
import { updateContract } from 'shared/supabase/contracts'
import { insertLiquidity } from 'shared/supabase/liquidity'
import { broadcastUpdatedAnswers } from 'shared/websockets/helpers'
import { addContractLiquidity } from './add-liquidity'

type AnswerRow = {
  id: string
  index: number
  contract_id: string
  user_id: string
  text: string
  created_time: string
  pool_yes: number
  pool_no: number
  prob: number
  total_liquidity: number
  subsidy_pool: number
  resolution: string | null
}

const answerRow = (id: string, index: number, resolution: string | null) =>
  ({
    id,
    index,
    contract_id: 'M',
    user_id: 'creator',
    text: id,
    created_time: '2026-01-01T00:00:00Z',
    pool_yes: 100,
    pool_no: 100,
    prob: 0.5,
    total_liquidity: 50,
    subsidy_pool: 0,
    resolution,
  } as AnswerRow)

// The two statements addSubsidyToOpenAnswers runs, honouring their predicates.
const fakeTx = (answers: AnswerRow[]) => ({
  oneOrNone: jest.fn(async (sql: string) => {
    if (/system_trading_status/.test(sql)) return { status: true }
    throw new Error(`unexpected: ${sql}`)
  }),
  one: jest.fn(async (sql: string) => {
    if (/as resolved/.test(sql)) return { resolved: false }
    throw new Error(`unexpected: ${sql}`)
  }),
  map: jest.fn(
    async (sql: string, params: unknown[], cb: (r: any) => unknown) => {
      if (/select id from answers/.test(sql)) {
        if (!/for update/.test(sql)) throw new Error('must lock the answers')
        const open = /resolution is null/.test(sql)
          ? answers.filter((a) => a.resolution === null)
          : answers
        return open.map((a) => cb({ id: a.id }))
      }
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
  ;(getContract as jest.Mock).mockResolvedValue({
    id: 'M',
    creatorId: 'creator',
    mechanism: 'cpmm-multi-1',
    outcomeType: 'MULTIPLE_CHOICE',
    token: 'MANA',
    visibility: 'public',
    answers: [],
    ...contract,
  })
  ;(insertLiquidity as jest.Mock).mockImplementation(
    async (_: unknown, lp: Omit<LiquidityProvision, 'id'>) => ({
      liquidity_id: 'L',
      contract_id: lp.contractId,
      data: lp,
    })
  )
  const { result, continue: then } = await addContractLiquidity(
    'M',
    90,
    'whale'
  )
  await then()
  return result
}

const contractUpdate = () =>
  (updateContract as jest.Mock).mock.calls.map(([, , update]) => update)

beforeEach(() => {
  jest.clearAllMocks()
  ;(getUser as jest.Mock).mockResolvedValue({ id: 'whale', balance: 1000 })
})

describe('adding liquidity to a whole independent multiple choice market', () => {
  it('splits it among the open answers as their own pending subsidy', async () => {
    const answers = [
      answerRow('A', 0, null),
      answerRow('B', 1, 'NO'),
      answerRow('C', 2, null),
      answerRow('D', 3, null),
    ]
    const liquidity = await run({ shouldAnswersSumToOne: false }, answers)

    expect(answers.map((a) => a.subsidy_pool)).toEqual([30, 0, 30, 30])
    expect(answers.map((a) => a.total_liquidity)).toEqual([80, 50, 80, 80])
    // The market's own pending subsidy is left alone.
    expect(contractUpdate()).toHaveLength(1)
    expect(Object.keys(contractUpdate()[0])).not.toContain('subsidyPool')
    expect(Object.keys(contractUpdate()[0])).toContain('totalLiquidity')
    expect(liquidity).toMatchObject({ amount: 90, answerIds: ['A', 'C', 'D'] })
    expect(liquidity.answerId).toBeUndefined()
    expect(broadcastUpdatedAnswers).toHaveBeenCalledWith(
      'M',
      expect.arrayContaining([expect.objectContaining({ id: 'A' })])
    )
  })

  it('is refused once every answer has resolved', async () => {
    const answers = [answerRow('A', 0, 'YES'), answerRow('B', 1, 'NO')]
    await expect(
      run({ shouldAnswersSumToOne: false }, answers)
    ).rejects.toThrow('This market has already resolved')
    expect(insertLiquidity).not.toHaveBeenCalled()
  })

  it("leaves a linked market's subsidy with the market", async () => {
    const answers = [answerRow('A', 0, null), answerRow('B', 1, null)]
    const liquidity = await run({ shouldAnswersSumToOne: true }, answers)

    expect(answers.map((a) => a.subsidy_pool)).toEqual([0, 0])
    expect(Object.keys(contractUpdate()[0])).toContain('subsidyPool')
    expect(liquidity.answerIds).toBeUndefined()
  })
})
