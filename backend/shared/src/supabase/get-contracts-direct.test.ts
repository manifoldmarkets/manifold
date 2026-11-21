import { CPMMMultiContract } from 'common/contract'
import { getContractsDirect } from './contracts'
import { SupabaseDirectClient } from './init'

jest.mock('shared/helpers/openai-utils', () => ({}))
jest.mock('shared/helpers/prompt-ai', () => ({}))
jest.mock('shared/websockets/helpers', () => ({}))

type ContractRow = { data: Record<string, unknown>; importance_score: number }
type AnswerRow = {
  id: string
  contract_id: string
  index: number
  text: string
  created_time: string
}

const contractRow = (id: string, mechanism: string): ContractRow => ({
  data: { id, mechanism, question: `Question ${id}`, createdTime: 1 },
  importance_score: 0,
})

const answerRow = (contractId: string, index: number): AnswerRow => ({
  id: `${contractId}-a${index}`,
  contract_id: contractId,
  index,
  text: `Answer ${index}`,
  created_time: '2026-11-21T00:00:00Z',
})

// Serves the two statements of getContractsDirect's multi query from memory.
const fakePg = (contracts: ContractRow[], answers: AnswerRow[]) => {
  const multi = jest.fn(async (_sql: string, params: [string[]]) => {
    const ids = new Set(params[0])
    return [
      contracts.filter((c) => ids.has(c.data.id as string)),
      answers.filter((a) => ids.has(a.contract_id)),
    ]
  })
  return { pg: { multi } as unknown as SupabaseDirectClient, multi }
}

describe('getContractsDirect', () => {
  it('returns nothing without querying when given no ids', async () => {
    const { pg, multi } = fakePg([], [])
    await expect(getContractsDirect([], pg)).resolves.toEqual([])
    expect(multi).not.toHaveBeenCalled()
  })

  it('asks for each id once', async () => {
    const { pg, multi } = fakePg([contractRow('a', 'cpmm-1')], [])
    await getContractsDirect(['a', 'b', 'a', 'a'], pg)
    expect(multi).toHaveBeenCalledTimes(1)
    expect(multi.mock.calls[0][1]).toEqual([['a', 'b']])
  })

  it('gives each multiple choice market its own answers, in index order', async () => {
    const { pg } = fakePg(
      [
        contractRow('mc1', 'cpmm-multi-1'),
        contractRow('mc2', 'cpmm-multi-2'),
        contractRow('empty', 'cpmm-multi-2'),
        contractRow('bin', 'cpmm-1'),
      ],
      [
        answerRow('mc2', 1),
        answerRow('mc1', 2),
        answerRow('mc2', 0),
        answerRow('mc1', 0),
        answerRow('mc1', 1),
        // An answer whose market is not in the result must not land anywhere.
        answerRow('elsewhere', 0),
      ]
    )
    const contracts = await getContractsDirect(
      ['mc1', 'mc2', 'empty', 'bin'],
      pg
    )
    const byId = new Map(contracts.map((c) => [c.id, c]))
    const answerIds = (id: string) =>
      (byId.get(id) as CPMMMultiContract).answers.map((a) => a.id)

    expect(answerIds('mc1')).toEqual(['mc1-a0', 'mc1-a1', 'mc1-a2'])
    expect(answerIds('mc2')).toEqual(['mc2-a0', 'mc2-a1'])
    expect(answerIds('empty')).toEqual([])
    expect(byId.get('bin')).not.toHaveProperty('answers')
  })

  // The old per-market filter did contracts x answers comparisons: 8 billion
  // here, minutes of blocked event loop. One pass over the answers is linear.
  it('stays linear for a whole account of multiple choice markets', async () => {
    const marketCount = 40_000
    const answersPerMarket = 5
    const contracts = Array.from({ length: marketCount }, (_, i) =>
      contractRow(`m${i}`, 'cpmm-multi-2')
    )
    const answers = contracts.flatMap((c) =>
      Array.from({ length: answersPerMarket }, (_, j) =>
        answerRow(c.data.id as string, answersPerMarket - 1 - j)
      )
    )
    const { pg } = fakePg(contracts, answers)

    const start = Date.now()
    const result = await getContractsDirect(
      contracts.map((c) => c.data.id as string),
      pg
    )
    const elapsedMs = Date.now() - start

    expect(result).toHaveLength(marketCount)
    for (const contract of result) {
      const multi = contract as CPMMMultiContract
      expect(multi.answers.map((a) => a.index)).toEqual([0, 1, 2, 3, 4])
      expect(multi.answers.every((a) => a.contractId === contract.id)).toBe(
        true
      )
    }
    expect(elapsedMs).toBeLessThan(10_000)
  }, 60_000)
})
