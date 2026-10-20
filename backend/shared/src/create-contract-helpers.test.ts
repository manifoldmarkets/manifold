jest.mock('shared/txn/run-txn', () => ({ runTxnOutsideBetQueue: jest.fn() }))
jest.mock('shared/supabase/contracts', () => ({ updateContract: jest.fn() }))
jest.mock('shared/supabase/liquidity', () => ({ insertLiquidity: jest.fn() }))
jest.mock('shared/websockets/helpers', () => ({
  broadcastNewAnswer: jest.fn(),
  broadcastUpdatedAnswers: jest.fn(),
}))

import { Contract } from 'common/contract'
import { updateContract } from 'shared/supabase/contracts'
import { insertLiquidity } from 'shared/supabase/liquidity'
import { generateAntes } from './create-contract-helpers'

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

const answerRow = (id: string, index: number) =>
  ({
    id,
    index,
    contract_id: 'M',
    created_time: '2026-01-01T00:00:00Z',
    pool_yes: 50,
    pool_no: 50,
    total_liquidity: 50,
    subsidy_pool: 0,
    resolution: null,
  } as AnswerRow)

// The new market's transaction, running the two statements
// addSubsidyToOpenAnswers runs.
const fakePg = (answers: AnswerRow[]) => {
  const tx = {
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
  }
  return { ...tx, txIf: (fn: (t: typeof tx) => unknown) => fn(tx) }
}

const market = (shouldAnswersSumToOne: boolean, answerIds: string[]) =>
  ({
    id: 'M',
    mechanism: 'cpmm-multi-1',
    outcomeType: 'MULTIPLE_CHOICE',
    createdTime: Date.now(),
    shouldAnswersSumToOne,
    answers: answerIds.map((id) => ({ id })),
  } as unknown as Contract)

const insertedProvisions = () =>
  (insertLiquidity as jest.Mock).mock.calls.map(([, lp]) => lp)

beforeEach(() => jest.clearAllMocks())

describe('extra liquidity on a new multiple choice market', () => {
  it('goes to the answers of an independent market in equal shares', async () => {
    const answers = [answerRow('A', 0), answerRow('B', 1), answerRow('C', 2)]
    await generateAntes(
      fakePg(answers) as any,
      'creator',
      market(false, ['A', 'B', 'C']),
      150,
      450
    )

    expect(answers.map((a) => a.subsidy_pool)).toEqual([100, 100, 100])
    const provisions = insertedProvisions()
    // One ante per answer, then the extra, recorded with its answers.
    expect(provisions.map((lp) => lp.answerId)).toEqual([
      'A',
      'B',
      'C',
      undefined,
    ])
    expect(provisions[3]).toMatchObject({
      amount: 300,
      answerIds: ['A', 'B', 'C'],
    })
    const [, , update] = (updateContract as jest.Mock).mock.calls[0]
    expect(Object.keys(update)).toEqual(['totalLiquidity'])
  })

  it("stays with a linked market's own pending subsidy", async () => {
    const answers = [answerRow('A', 0), answerRow('B', 1)]
    await generateAntes(
      fakePg(answers) as any,
      'creator',
      market(true, ['A', 'B']),
      100,
      400
    )

    expect(answers.map((a) => a.subsidy_pool)).toEqual([0, 0])
    expect(insertedProvisions()[1].answerIds).toBeUndefined()
    const [, , update] = (updateContract as jest.Mock).mock.calls[0]
    expect(Object.keys(update).sort()).toEqual([
      'subsidyPool',
      'totalLiquidity',
    ])
  })
})
