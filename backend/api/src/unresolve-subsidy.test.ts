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
  isProd: () => false,
  log: jest.fn(),
}))
jest.mock('shared/analytics', () => ({ trackPublicEvent: jest.fn() }))
jest.mock('shared/helpers/fn-queue', () => ({ betsQueue: {} }))
jest.mock('shared/helpers/user-contract-metrics', () => ({
  getContractMetricsForContract: jest.fn(async () => []),
  bulkUpdateContractMetrics: jest.fn(),
}))
jest.mock('shared/record-contract-edit', () => ({
  recordContractEdit: jest.fn(),
}))
jest.mock('shared/resolve-market-helpers', () => ({
  checkForNegativeBalancesAndPayouts: jest.fn(),
}))
jest.mock('shared/supabase/contracts', () => ({ updateContract: jest.fn() }))
jest.mock('shared/supabase/users', () => ({
  bulkIncrementBalancesQuery: jest.fn(),
}))
jest.mock('shared/txn/run-txn', () => ({ insertTxns: jest.fn() }))
jest.mock('shared/websockets/helpers', () => ({
  broadcastUpdatedAnswers: jest.fn(),
  broadcastUpdatedContract: jest.fn(),
}))

import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateContract } from 'shared/supabase/contracts'
import { getContract, getUser } from 'shared/utils'
import { broadcastUpdatedContract } from 'shared/websockets/helpers'
import { getAnswerContractSubsidyShare, unresolveMain } from './unresolve'

const creatorId = 'creator'
// Every answer's current resolution, as the answers table holds it.
const recently = Date.now() - 60 * 1000
// The resolution's own edit lands just after it commits; others are earlier
// or later resolutions of other answers.
const ownEdit = recently + 50
const earlierEdit = recently - 30 * 1000
const laterEdit = recently + 30 * 1000

type SnapshotAnswer = {
  id: string
  subsidyPool: number
  resolution?: string
  resolutionTime?: number
}

// A row of contract_edits as resolveMarketHelper records it: the market as the
// resolution found it, before its own update.
type Edit = {
  createdTime: number
  updatedKeys: string[]
  data: { isResolved: boolean; subsidyPool: number; answers: SnapshotAnswer[] }
}

const answerResolutionKeys = ['id', 'subsidyPool', 'answers']
const marketResolutionKeys = ['id', 'isResolved', 'subsidyPool', 'answers']

const latest = (edits: Edit[]) =>
  [...edits].sort((a, b) => b.createdTime - a.createdTime)[0]

// The two contract_edits lookups, honouring the predicates their SQL states.
const answerSnapshotRow = (sql: string, edits: Edit[], answerId: unknown) => {
  const sinceResolution = /created_time >= \(\s*select resolution_time/.test(
    sql
  )
  const edit = latest(
    edits.filter(
      (e) =>
        e.updatedKeys.includes('subsidyPool') &&
        e.data.answers.some((a) => a.id === answerId && !a.resolution) &&
        (!sinceResolution || e.createdTime >= recently)
    )
  )
  if (!edit) return null
  return {
    answer_subsidy_pool: edit.data.answers.find((a) => a.id === answerId)!
      .subsidyPool,
    contract_subsidy_pool: edit.data.subsidyPool,
    unresolved_count: edit.data.answers.filter((a) => !a.resolutionTime).length,
  }
}
const marketSnapshotRow = (edits: Edit[]) => {
  const edit = latest(
    edits.filter(
      (e) => e.updatedKeys.includes('subsidyPool') && !e.data.isResolved
    )
  )
  return edit ? { subsidy_pool: edit.data.subsidyPool } : null
}

const fakeTx = (
  edits: Edit[],
  restoredAnswerPools: Record<string, number>
) => ({
  // Like pg-promise, the mapper is called with null when no row matches.
  oneOrNone: jest.fn(
    async (sql: string, params: unknown[], cb?: (r: any) => unknown) => {
      // contract_edits first: the snapshot lookup reads answers in a subquery.
      const r = /from contract_edits/.test(sql)
        ? /answer_data->>'id' = \$1/.test(sql)
          ? answerSnapshotRow(sql, edits, params[0])
          : marketSnapshotRow(edits)
        : /from answers/.test(sql)
        ? { resolution_time: recently }
        : null
      return cb ? cb(r) : r
    }
  ),
  map: jest.fn(async () => []),
  many: jest.fn(async () => []),
  one: jest.fn(async (sql: string, params: unknown[]) => {
    if (!/update answers/.test(sql)) throw new Error(`unexpected: ${sql}`)
    restoredAnswerPools[params[0] as string] = params[2] as number
    return { id: params[0] }
  }),
})

// The contract's row, updated the way updateContract's SQL updates it: an
// increment adds to the stored value, where a plain value replaces it.
const applyUpdate = (
  row: Record<string, unknown>,
  update: Record<string, unknown>
) => {
  for (const [key, value] of Object.entries(update)) {
    if (typeof value !== 'function') {
      row[key] = value
      continue
    }
    const sql: string = value(key)
    const increment = sql.match(/::numeric \+ (\S+)\)$/)
    if (increment) row[key] = (row[key] as number) + Number(increment[1])
    else if (sql.startsWith('-')) delete row[key]
    else throw new Error(`unexpected update of ${key}: ${sql}`)
  }
  return { ...row }
}

const run = async (
  contractRow: Record<string, unknown>,
  edits: Edit[],
  answerId?: string
) => {
  const restoredAnswerPools: Record<string, number> = {}
  const tx = fakeTx(edits, restoredAnswerPools)
  ;(createSupabaseDirectClient as jest.Mock).mockReturnValue({
    tx: (fn: (t: typeof tx) => unknown) => fn(tx),
  })
  ;(getContract as jest.Mock).mockResolvedValue({ ...contractRow })
  ;(updateContract as jest.Mock).mockImplementation(
    async (_pg: unknown, _id: string, update: Record<string, unknown>) =>
      applyUpdate(contractRow, update)
  )
  await unresolveMain(
    { contractId: contractRow.id as string, answerId },
    { uid: creatorId } as any,
    {} as any
  )
  return { restoredAnswerPools }
}

const indieMulti = (
  fields: Record<string, unknown>
): Record<string, unknown> => ({
  id: 'M',
  creatorId,
  mechanism: 'cpmm-multi-1',
  outcomeType: 'MULTIPLE_CHOICE',
  shouldAnswersSumToOne: false,
  token: 'MANA',
  visibility: 'public',
  answers: [],
  ...fields,
})

beforeEach(() => {
  jest.clearAllMocks()
  ;(getUser as jest.Mock).mockResolvedValue({ id: creatorId })
})

describe('unresolving an answer of an independent market', () => {
  it('returns only its own share when a later answer resolved the market', async () => {
    // A took half of the pool's 100. A whole-market add then made it 150,
    // and B, the last answer, took all 150, resolving the market.
    const edits: Edit[] = [
      {
        createdTime: ownEdit,
        updatedKeys: answerResolutionKeys,
        data: {
          isResolved: false,
          subsidyPool: 100,
          answers: [
            { id: 'a', subsidyPool: 7 },
            { id: 'b', subsidyPool: 0 },
          ],
        },
      },
      {
        createdTime: laterEdit,
        updatedKeys: marketResolutionKeys,
        data: {
          isResolved: false,
          subsidyPool: 150,
          answers: [
            { id: 'a', subsidyPool: 0, resolution: 'YES', resolutionTime: 1 },
            { id: 'b', subsidyPool: 0 },
          ],
        },
      },
    ]
    const contractRow = indieMulti({
      isResolved: true,
      resolutionTime: recently,
      resolution: 'MKT',
      subsidyPool: 0,
    })

    const { restoredAnswerPools } = await run(contractRow, edits, 'a')

    // Not 150: B's 150 stays paid out, so A's re-resolution must find 50.
    expect(contractRow.subsidyPool).toBe(50)
    expect(contractRow.isResolved).toBe(false)
    expect(restoredAnswerPools).toEqual({ a: 7 })
    expect(broadcastUpdatedContract).toHaveBeenCalledWith(
      'public',
      expect.objectContaining({ id: 'M', subsidyPool: 50 })
    )
  })

  it('returns its whole take when it resolved the market itself', async () => {
    // B took half of 100, then A, the last answer, took the remaining 50.
    const edits: Edit[] = [
      {
        createdTime: earlierEdit,
        updatedKeys: answerResolutionKeys,
        data: {
          isResolved: false,
          subsidyPool: 100,
          answers: [
            { id: 'a', subsidyPool: 0 },
            { id: 'b', subsidyPool: 0 },
          ],
        },
      },
      {
        createdTime: ownEdit,
        updatedKeys: marketResolutionKeys,
        data: {
          isResolved: false,
          subsidyPool: 50,
          answers: [
            { id: 'a', subsidyPool: 3 },
            { id: 'b', subsidyPool: 0, resolution: 'NO', resolutionTime: 1 },
          ],
        },
      },
    ]
    const contractRow = indieMulti({
      isResolved: true,
      resolutionTime: recently,
      resolution: 'MKT',
      subsidyPool: 0,
    })

    const { restoredAnswerPools } = await run(contractRow, edits, 'a')

    expect(contractRow.subsidyPool).toBe(50)
    expect(restoredAnswerPools).toEqual({ a: 3 })
  })

  it('returns its share to a market still open to other answers', async () => {
    // A took a third of 90; B and C are still trading on the other 60.
    const edits: Edit[] = [
      {
        createdTime: ownEdit,
        updatedKeys: answerResolutionKeys,
        data: {
          isResolved: false,
          subsidyPool: 90,
          answers: [
            { id: 'a', subsidyPool: 0 },
            { id: 'b', subsidyPool: 0 },
            { id: 'c', subsidyPool: 0 },
          ],
        },
      },
    ]
    const contractRow = indieMulti({ isResolved: false, subsidyPool: 60 })

    await run(contractRow, edits, 'a')

    // Split three ways again, each answer's resolution takes 30, as before.
    expect(contractRow.subsidyPool).toBe(90)
    expect(broadcastUpdatedContract).toHaveBeenCalledWith('public', {
      id: 'M',
      subsidyPool: 90,
    })
  })

  it('adds to the pool rather than replacing what is there now', async () => {
    const edits: Edit[] = [
      {
        createdTime: ownEdit,
        updatedKeys: answerResolutionKeys,
        data: {
          isResolved: false,
          subsidyPool: 90,
          answers: [
            { id: 'a', subsidyPool: 0 },
            { id: 'b', subsidyPool: 0 },
            { id: 'c', subsidyPool: 0 },
          ],
        },
      },
    ]
    // The drizzle has moved some of the 60 into B and C's pools since.
    const contractRow = indieMulti({ isResolved: false, subsidyPool: 12 })

    await run(contractRow, edits, 'a')

    expect(contractRow.subsidyPool).toBe(42)
  })

  it('puts nothing back without a snapshot of its resolution', async () => {
    const contractRow = indieMulti({
      isResolved: true,
      resolutionTime: recently,
      resolution: 'MKT',
      subsidyPool: 0,
    })

    const { restoredAnswerPools } = await run(contractRow, [], 'a')

    expect(contractRow.subsidyPool).toBe(0)
    expect(restoredAnswerPools).toEqual({ a: 0 })
  })

  it("ignores another answer's earlier snapshot when its own is missing", async () => {
    // B took a third of 90, the drizzle then spent all but 12, and A took 6
    // of that, but A's resolution never recorded its edit. B's, from before
    // A resolved, still shows A unresolved, with 90 among three answers.
    const edits: Edit[] = [
      {
        createdTime: earlierEdit,
        updatedKeys: answerResolutionKeys,
        data: {
          isResolved: false,
          subsidyPool: 90,
          answers: [
            { id: 'a', subsidyPool: 4 },
            { id: 'b', subsidyPool: 0 },
            { id: 'c', subsidyPool: 0 },
          ],
        },
      },
    ]
    const contractRow = indieMulti({ isResolved: false, subsidyPool: 6 })

    const { restoredAnswerPools } = await run(contractRow, edits, 'a')

    // Not 6 + 30: what A took can't be read from B's snapshot.
    expect(contractRow.subsidyPool).toBe(6)
    expect(restoredAnswerPools).toEqual({ a: 0 })
  })
})

it('restores a whole market from its last unresolved snapshot, as before', async () => {
  const edits: Edit[] = [
    {
      createdTime: ownEdit,
      updatedKeys: marketResolutionKeys,
      data: { isResolved: false, subsidyPool: 40, answers: [] },
    },
  ]
  const contractRow = {
    id: 'M',
    creatorId,
    mechanism: 'cpmm-1',
    outcomeType: 'BINARY',
    token: 'MANA',
    visibility: 'public',
    pool: { YES: 100, NO: 100 },
    p: 0.5,
    isResolved: true,
    resolutionTime: recently,
    resolution: 'YES',
    subsidyPool: 0,
  }

  await run(contractRow, edits)

  expect(contractRow.subsidyPool).toBe(40)
})

describe('getAnswerContractSubsidyShare', () => {
  it('splits the pool among the answers unresolved at the time', () => {
    expect(
      getAnswerContractSubsidyShare({
        contractSubsidyPool: 90,
        unresolvedCount: 3,
      })
    ).toBe(30)
  })

  it('takes a missing count as a single answer, as the resolution does', () => {
    expect(
      getAnswerContractSubsidyShare({
        contractSubsidyPool: 90,
        unresolvedCount: 0,
      })
    ).toBe(90)
  })

  it('is zero without a usable snapshot', () => {
    expect(getAnswerContractSubsidyShare(null)).toBe(0)
    expect(
      getAnswerContractSubsidyShare({
        contractSubsidyPool: null,
        unresolvedCount: 2,
      })
    ).toBe(0)
    expect(
      getAnswerContractSubsidyShare({
        contractSubsidyPool: -5,
        unresolvedCount: 1,
      })
    ).toBe(0)
    expect(
      getAnswerContractSubsidyShare({
        contractSubsidyPool: NaN,
        unresolvedCount: 1,
      })
    ).toBe(0)
  })
})
