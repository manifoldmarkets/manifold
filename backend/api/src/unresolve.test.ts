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
import { getContract, getUser } from 'shared/utils'
import { unresolveMain } from './unresolve'

const creatorId = 'creator'
const recently = Date.now() - 60 * 1000

const indieMulti = (id: string) => ({
  id,
  creatorId,
  mechanism: 'cpmm-multi-1',
  outcomeType: 'MULTIPLE_CHOICE',
  shouldAnswersSumToOne: false,
  token: 'MANA',
  visibility: 'public',
  isResolved: false,
  answers: [],
})

type AnswerRow = {
  id: string
  contract_id: string
  resolution_time: number | null
}

// The answer's own WHERE clause, bound to the contract. Matched on the outer
// clause specifically: the UPDATE's contract_bets subquery has its own
// contract_id predicate.
const boundToContract = /where id = \$1\s+and contract_id = \$2/

// A minimal stand-in for the answers table that honours the predicates the
// handler's SQL actually states, so an unbound lookup or update is visible.
const fakeTx = (answers: AnswerRow[]) => {
  const matches = (sql: string, params: unknown[]) =>
    answers.filter(
      (a) =>
        a.id === params[0] &&
        (!boundToContract.test(sql) || a.contract_id === params[1])
    )
  return {
    // Like pg-promise, the mapper is called with null when no row matches.
    oneOrNone: jest.fn(
      async (sql: string, params: unknown[], cb?: (r: any) => unknown) => {
        const row = /from answers/.test(sql) ? matches(sql, params)[0] : null
        const r = row ? { resolution_time: row.resolution_time } : null
        return cb ? cb(r) : r
      }
    ),
    map: jest.fn(async () => []),
    many: jest.fn(async () => []),
    one: jest.fn(async (sql: string, params: unknown[]) => {
      if (!/update answers/.test(sql)) throw new Error(`unexpected: ${sql}`)
      const rows = matches(sql, params)
      if (rows.length !== 1) throw new Error('No data returned from the query.')
      rows[0].resolution_time = null
      return { id: rows[0].id, contractId: rows[0].contract_id }
    }),
  }
}

const run = (answers: AnswerRow[], contractId: string, answerId: string) => {
  const tx = fakeTx(answers)
  ;(createSupabaseDirectClient as jest.Mock).mockReturnValue({
    tx: (fn: (t: typeof tx) => unknown) => fn(tx),
  })
  return {
    tx,
    result: unresolveMain(
      { contractId, answerId },
      { uid: creatorId } as any,
      {} as any
    ),
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getUser as jest.Mock).mockResolvedValue({ id: creatorId })
  ;(getContract as jest.Mock).mockImplementation(
    async (_: unknown, id: string) => indieMulti(id)
  )
})

it('rejects an answer that belongs to a different contract', async () => {
  const answers = [{ id: 'b1', contract_id: 'B', resolution_time: recently }]
  const { tx, result } = run(answers, 'A', 'b1')

  await expect(result).rejects.toMatchObject({ code: 400 })
  expect(answers[0].resolution_time).toBe(recently)
  expect(tx.one).not.toHaveBeenCalled()
})

it('unresolves an answer on its own contract', async () => {
  const answers = [{ id: 'b1', contract_id: 'B', resolution_time: recently }]
  const { tx, result } = run(answers, 'B', 'b1')

  await expect(result).resolves.toMatchObject({ success: true })
  expect(answers[0].resolution_time).toBeNull()
  const [lookupSql] = tx.oneOrNone.mock.calls.find(([sql]) =>
    /from answers/.test(sql)
  )!
  expect(lookupSql).toMatch(boundToContract)
  expect(lookupSql).toMatch(/for update/)
  const [updateSql] = tx.one.mock.calls[0]
  expect(updateSql).toMatch(boundToContract)
})

it('rejects an answer that does not exist with a 400', async () => {
  const { tx, result } = run([], 'A', 'missing')

  await expect(result).rejects.toMatchObject({ code: 400 })
  expect(tx.one).not.toHaveBeenCalled()
})
