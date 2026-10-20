jest.mock('api/helpers/endpoint', () => ({
  APIError: jest.requireActual('common/api/utils').APIError,
}))
jest.mock('api/helpers/rate-limit', () => ({
  onlyUsersWhoCanPerformAction: (_: string, fn: unknown) => fn,
}))
jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(),
  SERIAL_MODE: 'serializable',
}))
jest.mock('shared/utils', () => ({
  getContract: jest.fn(),
  getUser: jest.fn(),
  getContractAndMetricsAndLiquidities: jest.fn(),
  revalidateStaticProps: jest.fn(),
  isProd: () => false,
  log: Object.assign(jest.fn(), { error: jest.fn(), warn: jest.fn() }),
}))
jest.mock('shared/analytics', () => ({ trackPublicEvent: jest.fn() }))
jest.mock('shared/helpers/fn-queue', () => ({ betsQueue: {} }))
jest.mock('shared/helpers/user-contract-metrics', () => ({
  getContractMetricsForContract: jest.fn(async () => []),
  bulkUpdateContractMetrics: jest.fn(),
  bulkUpdateContractMetricsQuery: () => 'METRICS',
}))
jest.mock('shared/helpers/user-contract-loans', () => ({
  getLoanTrackingForContract: jest.fn(async () => []),
}))
jest.mock('shared/create-notification', () => ({
  createContractResolvedNotifications: jest.fn(),
}))
jest.mock('shared/record-contract-edit', () => ({
  recordContractEdit: jest.fn(),
}))
jest.mock('shared/supabase/answers', () => ({
  updateAnswer: jest.fn(),
  updateAnswers: jest.fn(),
}))
jest.mock('shared/supabase/contracts', () => ({ updateContract: jest.fn() }))
// The statements these build reach the fake transaction below as text, which
// it reads back.
jest.mock('shared/supabase/users', () => ({
  bulkIncrementBalancesQuery: (updates: unknown[]) =>
    `BALANCES ${JSON.stringify(updates)}`,
}))
jest.mock('shared/supabase/utils', () => ({
  FieldVal: jest.requireActual('shared/supabase/utils').FieldVal,
  bulkInsertQuery: (table: string, values: unknown[]) =>
    `INSERT ${table} ${JSON.stringify(values)}`,
  updateDataQuery: (_table: string, _idField: string, data: unknown) =>
    `UPDATE ${JSON.stringify(data)}`,
}))
jest.mock('shared/txn/run-txn', () => ({
  insertTxns: jest.fn(),
  txnToRow: (txn: unknown) => txn,
  runTxnOutsideBetQueueIgnoringBalance: jest.fn(),
}))
jest.mock('shared/websockets/helpers', () => ({
  broadcastUpdatedAnswers: jest.fn(),
  broadcastUpdatedContract: jest.fn(),
  broadcastUpdatedMetrics: jest.fn(),
}))

import { Answer } from 'common/answer'
import { MarketContract } from 'common/contract'
import { LiquidityProvision } from 'common/liquidity-provision'
import { Txn } from 'common/txn'
import { User } from 'common/user'
import { recordContractEdit } from 'shared/record-contract-edit'
import { resolveMarketHelper } from 'shared/resolve-market-helpers'
import { updateAnswer } from 'shared/supabase/answers'
import { updateContract } from 'shared/supabase/contracts'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { insertTxns } from 'shared/txn/run-txn'
import {
  getContract,
  getContractAndMetricsAndLiquidities,
  getUser,
} from 'shared/utils'
import { getResolutionSubsidyToRestore, unresolveMain } from './unresolve'

const M = 'M'
const creatorId = 'creator'
const provider = 'provider'

type StoredTxn = Omit<Txn, 'id' | 'createdTime'> & {
  id: string
  createdTime: number
}

// A row of contract_edits: the market as a resolution found it, which unresolve
// once read an answer's subsidy from.
type Edit = {
  createdTime: number
  updatedKeys: string[]
  data: {
    isResolved: boolean
    subsidyPool: number
    answers: { id: string; subsidyPool: number; resolutionTime?: number }[]
  }
}

// The rows this flow reads and writes, held in memory.
type Db = {
  contract: Record<string, unknown>
  answers: Answer[]
  liquidities: LiquidityProvision[]
  txns: StoredTxn[]
  edits: Edit[]
  balances: Record<string, number>
  // Runs once unresolve has read the answer's resolution, as a concurrent
  // request could.
  afterResolutionRead?: () => void
}

const answerById = (db: Db, id: string) => db.answers.find((a) => a.id === id)!
const txnsOf = (db: Db, category: string) =>
  db.txns.filter((t) => t.category === category)
const contractOf = (db: Db) =>
  JSON.parse(JSON.stringify({ ...db.contract, answers: db.answers }))

const answerRow = (a: Answer) => ({
  id: a.id,
  index: a.index,
  contract_id: a.contractId,
  user_id: a.userId,
  text: a.text,
  created_time: null,
  pool_yes: a.poolYes,
  pool_no: a.poolNo,
  p: a.p,
  prob: a.prob,
  total_liquidity: a.totalLiquidity,
  subsidy_pool: a.subsidyPool,
  is_other: false,
  resolution: a.resolution ?? null,
  resolution_time: null,
  resolution_probability: a.resolutionProbability ?? null,
  resolver_id: a.resolverId ?? null,
  volume: a.volume,
})

const txnRow = (t: StoredTxn) => ({
  id: t.id,
  amount: t.amount,
  category: t.category,
  token: t.token,
  from_id: t.fromId,
  from_type: t.fromType,
  to_id: t.toId,
  to_type: t.toType,
  created_time: new Date(t.createdTime).toISOString(),
  data: { data: t.data, description: t.description },
})

const insert = (db: Db, txns: Omit<Txn, 'id' | 'createdTime'>[]) => {
  for (const t of txns)
    db.txns.push({ ...t, id: `t${db.txns.length}`, createdTime: Date.now() })
}

const applyBalances = (db: Db, statement: string) =>
  (
    JSON.parse(statement.slice('BALANCES '.length)) as {
      id: string
      balance?: number
    }[]
  ).map(({ id, balance }) => {
    db.balances[id] = (db.balances[id] ?? 0) + (balance ?? 0)
    return { id, balance: db.balances[id] }
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

// The answer's own WHERE clause, as opposed to the prob subquery's.
const boundToContract = /where id = \$1\s+and contract_id = \$2/

// A transaction over the rows above that honours the predicates each query
// states, so dropping one from the SQL changes what it finds.
const fakeTx = (db: Db) => {
  const answerOf = (id: unknown, contractId?: unknown) =>
    db.answers.find(
      (a) =>
        a.id === id && (contractId === undefined || a.contractId === contractId)
    )

  const readResolution = (sql: string, [answerId, contractId]: unknown[]) => {
    const a = answerOf(answerId, contractId)
    if (!a) return null
    const matchesResolution =
      /'resolutionTime'\)::numeric =\s+ts_to_millis\(a\.resolution_time\)/.test(
        sql
      )
    const records = db.txns.filter(
      (t) =>
        t.category === 'CONTRACT_RESOLUTION_SUBSIDY' &&
        t.fromId === contractId &&
        t.toId === contractId &&
        t.data?.answerId === answerId &&
        (!matchesResolution ||
          (a.resolutionTime !== undefined &&
            t.data?.resolutionTime === a.resolutionTime))
    )
    const record = /order by t\.created_time desc/.test(sql)
      ? records[records.length - 1]
      : records[0]
    const row = {
      resolution_time: a.resolutionTime ?? null,
      payout_start_time: record?.data?.payoutStartTime ?? null,
      answer_subsidy_pool: record?.data?.answerSubsidyPool ?? null,
      contract_subsidy_share: record?.data?.contractSubsidyShare ?? null,
    }
    db.afterResolutionRead?.()
    return row
  }

  // Whatever an edit lookup could ask of the latest edit that shows the
  // answer, if it names one, unresolved.
  const readEdit = (params: unknown[]) => {
    const answerId = params.find((p) => db.answers.some((a) => a.id === p))
    const edit = db.edits
      .filter(
        (e) =>
          e.updatedKeys.includes('subsidyPool') &&
          !e.data.isResolved &&
          (answerId === undefined ||
            e.data.answers.some((a) => a.id === answerId && !a.resolutionTime))
      )
      .sort((x, y) => y.createdTime - x.createdTime)[0]
    if (!edit) return null
    const answer = edit.data.answers.find((a) => a.id === answerId)
    return {
      subsidy_pool: edit.data.subsidyPool,
      contract_subsidy_pool: edit.data.subsidyPool,
      answer_subsidy_pool: answer?.subsidyPool ?? null,
      unresolved_count: edit.data.answers.filter((a) => !a.resolutionTime)
        .length,
    }
  }

  const oneOrNoneRow = (sql: string, params: unknown[]) => {
    if (/from answers a\s+left join txns t/.test(sql))
      return readResolution(sql, params)
    // Other guards on unresolving (none of these rows trips them).
    if (/from contract_liquidity/.test(sql)) return null
    // Before answers: a snapshot lookup can read them in a subquery.
    if (/from contract_edits/.test(sql)) return readEdit(params)
    if (/from answers/.test(sql)) {
      const a = answerOf(
        params[0],
        boundToContract.test(sql) ? params[1] : undefined
      )
      return a ? { resolution_time: a.resolutionTime ?? null } : null
    }
    if (
      /select max\(\(data->'data'->'payoutStartTime'\)::numeric\)/.test(sql)
    ) {
      const [contractId, answerId] = params
      const times = txnsOf(db, 'CONTRACT_RESOLUTION_PAYOUT')
        .filter(
          (t) =>
            t.fromId === contractId &&
            (answerId == null || t.data?.answerId === answerId)
        )
        .map((t) => t.data?.payoutStartTime as number)
      return { max: times.length ? Math.max(...times) : null }
    }
    return null
  }

  const updateAnswerRow = (sql: string, params: unknown[]) => {
    const [answerId, contractId, amount, resolvedAt] = params
    const a = answerOf(
      answerId,
      boundToContract.test(sql) ? contractId : undefined
    )
    if (!a) return null
    if (
      /and ts_to_millis\(resolution_time\) = \$4/.test(sql) &&
      a.resolutionTime !== resolvedAt
    )
      return null
    a.subsidyPool = /subsidy_pool = coalesce\(subsidy_pool, 0\) \+ \$3/.test(
      sql
    )
      ? a.subsidyPool + (amount as number)
      : (amount as number)
    delete a.resolution
    delete a.resolutionTime
    delete a.resolutionProbability
    delete a.resolverId
    return answerRow(a)
  }

  return {
    // Like pg-promise, the mapper is called with null when no row matches.
    oneOrNone: jest.fn(
      async (sql: string, params: unknown[], cb?: (r: any) => unknown) => {
        const r = oneOrNoneRow(sql, params)
        return cb ? cb(r) : r
      }
    ),
    one: jest.fn(
      async (sql: string, params: unknown[], cb?: (r: any) => unknown) => {
        if (!/update answers/.test(sql)) throw new Error(`unexpected: ${sql}`)
        const r = updateAnswerRow(sql, params)
        if (!r) throw new Error('No data returned from the query.')
        return cb ? cb(r) : r
      }
    ),
    map: jest.fn(
      async (sql: string, params: unknown[], cb: (r: any) => unknown) => {
        if (!/category = 'CONTRACT_RESOLUTION_PAYOUT'/.test(sql)) return []
        const [contractId, payoutStartTime, answerId] = params
        return txnsOf(db, 'CONTRACT_RESOLUTION_PAYOUT')
          .filter(
            (t) =>
              t.fromId === contractId &&
              (payoutStartTime == null ||
                t.data?.payoutStartTime === payoutStartTime) &&
              (answerId == null || t.data?.answerId === answerId)
          )
          .map(txnRow)
          .map(cb)
      }
    ),
    many: jest.fn(async (sql: string) =>
      sql.startsWith('BALANCES ') ? applyBalances(db, sql) : []
    ),
    // resolveMarketHelper's payouts, txns, contract and metrics, in order.
    multi: jest.fn(async (sql: string) =>
      sql
        .split(/;\s*--\s*\d+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
          if (s.startsWith('BALANCES ')) return applyBalances(db, s)
          if (s.startsWith('INSERT txns ')) {
            insert(db, JSON.parse(s.slice('INSERT txns '.length)))
            return []
          }
          if (s.startsWith('UPDATE ')) {
            const {
              id: _id,
              answers: _answers,
              ...attrs
            } = JSON.parse(s.slice('UPDATE '.length))
            Object.assign(db.contract, attrs)
            return []
          }
          if (s === 'METRICS') return []
          throw new Error(`unexpected statement: ${s}`)
        })
    ),
  }
}

const useDb = (db: Db) => {
  const tx = fakeTx(db)
  ;(createSupabaseDirectClient as jest.Mock).mockReturnValue({
    // resolveMarketHelper passes a transaction mode first.
    tx: (...args: unknown[]) =>
      (args[args.length - 1] as (t: typeof tx) => unknown)(tx),
  })
  ;(getContract as jest.Mock).mockImplementation(async () => contractOf(db))
  ;(getContractAndMetricsAndLiquidities as jest.Mock).mockImplementation(
    async () => ({
      contract: contractOf(db),
      contractMetrics: [],
      liquidities: db.liquidities.map((l) => ({ ...l })),
    })
  )
  ;(updateAnswer as jest.Mock).mockImplementation(
    async (_pg: unknown, id: string, data: Partial<Answer>) =>
      Object.assign(answerById(db, id), data)
  )
  ;(updateContract as jest.Mock).mockImplementation(
    async (_pg: unknown, _id: string, update: Record<string, unknown>) =>
      applyUpdate(db.contract, update)
  )
  ;(insertTxns as jest.Mock).mockImplementation(
    async (_pg: unknown, txns: Omit<Txn, 'id' | 'createdTime'>[]) =>
      insert(db, txns)
  )
  // As recordContractEdit records it, after the transaction: the contract it
  // was given.
  ;(recordContractEdit as jest.Mock).mockImplementation(
    async (contract: Edit['data'], _userId: string, updatedKeys: string[]) =>
      db.edits.push({
        createdTime: Date.now(),
        updatedKeys,
        data: JSON.parse(JSON.stringify(contract)),
      })
  )
}

const creator = { id: creatorId } as User

const resolve = async (
  db: Db,
  answerId: string,
  outcome: string,
  // What the caller read before the transaction, perhaps stale.
  contract = contractOf(db)
) => {
  useDb(db)
  await resolveMarketHelper(contract as MarketContract, creator, creator, {
    outcome,
    answerId,
  })
}

const unresolve = (db: Db, answerId?: string) => {
  useDb(db)
  return unresolveMain(
    { contractId: M, answerId },
    { uid: creatorId } as any,
    {} as any
  )
}

// The drizzle: the market's pending subsidy goes to its open answers, as their
// own, which their resolutions pay out like the pools it would deepen.
const drizzle = (db: Db) => {
  const open = db.answers.filter((a) => !a.resolution)
  for (const a of open)
    a.subsidyPool += (db.contract.subsidyPool as number) / open.length
  db.contract.subsidyPool = 0
}

const answer = (id: string, fields: Partial<Answer> = {}): Answer => ({
  id,
  index: 0,
  contractId: M,
  userId: creatorId,
  text: id,
  createdTime: 0,
  poolYes: 10,
  poolNo: 10,
  p: 0.5,
  prob: 0.5,
  totalLiquidity: 20,
  subsidyPool: 0,
  volume: 0,
  probChanges: { day: 0, week: 0, month: 0 },
  ...fields,
})

const wholeMarket = (amount: number): LiquidityProvision => ({
  id: `whole-${amount}`,
  userId: provider,
  contractId: M,
  createdTime: 0,
  amount,
})
const toAnswer = (answerId: string, amount: number): LiquidityProvision => ({
  ...wholeMarket(amount),
  id: `to-${answerId}`,
  answerId,
})

const indieMarket = (
  subsidyPool: number,
  answers: Answer[],
  liquidities: LiquidityProvision[]
): Db => ({
  contract: {
    id: M,
    slug: 'm',
    creatorId,
    creatorUsername: 'creator',
    mechanism: 'cpmm-multi-1',
    outcomeType: 'MULTIPLE_CHOICE',
    shouldAnswersSumToOne: false,
    token: 'MANA',
    visibility: 'public',
    isResolved: false,
    uniqueBettorCount: 0,
    subsidyPool,
  },
  answers,
  liquidities,
  txns: [],
  edits: [],
  balances: {},
})

// Three answers sharing a whole-market provision of 90, still pending in the
// market's pool, and 6 of A's own.
const threeAnswers = () =>
  indieMarket(
    90,
    [answer('A', { subsidyPool: 6 }), answer('B'), answer('C')],
    [wholeMarket(90)]
  )

let dateNow: jest.SpyInstance
let consoleLog: jest.SpyInstance
beforeEach(() => {
  jest.clearAllMocks()
  // Every call a millisecond on, so no two resolutions share a time.
  let clock = 1_800_000_000_000
  dateNow = jest.spyOn(Date, 'now').mockImplementation(() => (clock += 1))
  consoleLog = jest.spyOn(console, 'log').mockImplementation(() => undefined)
  ;(getUser as jest.Mock).mockResolvedValue({ id: creatorId })
})
afterEach(() => {
  dateNow.mockRestore()
  consoleLog.mockRestore()
})

describe('resolving an answer of an independent market', () => {
  it('records what it took from the pending subsidy, with its payouts', async () => {
    const db = threeAnswers()
    // Read before the transaction: the record holds what the transaction read.
    const stale = { ...contractOf(db), subsidyPool: 0 }

    await resolve(db, 'A', 'YES', stale)

    const [payout] = txnsOf(db, 'CONTRACT_RESOLUTION_PAYOUT')
    // Its pool, its own 6 and a third of the market's 90, as before.
    expect(payout).toMatchObject({ toId: provider, amount: 46 })
    expect(txnsOf(db, 'CONTRACT_RESOLUTION_SUBSIDY')).toEqual([
      expect.objectContaining({
        fromType: 'CONTRACT',
        fromId: M,
        toType: 'CONTRACT',
        toId: M,
        amount: 0,
        token: 'M$',
        data: {
          answerId: 'A',
          payoutStartTime: payout.data?.payoutStartTime,
          resolutionTime: answerById(db, 'A').resolutionTime,
          answerSubsidyPool: 6,
          contractSubsidyShare: 30,
        },
      }),
    ])
    expect(db.contract.subsidyPool).toBe(60)
  })

  it("records all of the market's pool when it resolves the market", async () => {
    const db = indieMarket(
      40,
      [answer('A'), answer('B', { resolution: 'NO', resolutionTime: 1 })],
      [wholeMarket(20)]
    )

    await resolve(db, 'A', 'NO')

    expect(db.contract).toMatchObject({ isResolved: true, subsidyPool: 0 })
    expect(txnsOf(db, 'CONTRACT_RESOLUTION_SUBSIDY')[0].data).toMatchObject({
      answerSubsidyPool: 0,
      contractSubsidyShare: 40,
    })
  })

  it('records what it took even when it pays nobody', async () => {
    // A has no providers of its own and the market none of its own.
    const db = indieMarket(
      30,
      [answer('A', { subsidyPool: 4 }), answer('B'), answer('C')],
      [toAnswer('B', 20)]
    )

    await resolve(db, 'A', 'YES')

    expect(txnsOf(db, 'CONTRACT_RESOLUTION_PAYOUT')).toEqual([])
    expect(txnsOf(db, 'CONTRACT_RESOLUTION_SUBSIDY')[0].data).toMatchObject({
      answerSubsidyPool: 4,
      contractSubsidyShare: 10,
    })
  })
})

describe('unresolving an answer of an independent market', () => {
  it('puts back everything its resolution took, on the answer', async () => {
    const db = threeAnswers()
    await resolve(db, 'A', 'YES')
    drizzle(db)

    await unresolve(db, 'A')

    expect(db.balances[provider]).toBe(0)
    expect(answerById(db, 'A')).toMatchObject({ subsidyPool: 36 })
    expect(answerById(db, 'A').resolutionTime).toBeUndefined()
    // Not the market's: the drizzle has given B and C the rest of it.
    expect(db.contract.subsidyPool).toBe(0)
  })

  it('then pays out on a cancellation what a cancellation alone pays', async () => {
    const cancelled = threeAnswers()
    await resolve(cancelled, 'A', 'CANCEL')
    drizzle(cancelled)
    await resolve(cancelled, 'B', 'YES')
    await resolve(cancelled, 'C', 'YES')

    const undone = threeAnswers()
    await resolve(undone, 'A', 'YES')
    drizzle(undone)
    await unresolve(undone, 'A')
    await resolve(undone, 'A', 'CANCEL')
    await resolve(undone, 'B', 'YES')
    await resolve(undone, 'C', 'YES')

    // The refund of A's third, 30, and B and C's pools with 30 each.
    expect(cancelled.balances[provider]).toBe(110)
    expect(undone.balances[provider]).toBe(110)
  })

  it('leaves the market its pool when a later answer resolved the market', async () => {
    const db = indieMarket(
      100,
      [answer('A', { subsidyPool: 7 }), answer('B')],
      [wholeMarket(100)]
    )
    await resolve(db, 'A', 'YES')
    // More whole-market liquidity, which B, the last answer, takes in full.
    db.contract.subsidyPool = (db.contract.subsidyPool as number) + 100
    await resolve(db, 'B', 'YES')
    expect(db.balances[provider]).toBe(67 + 160)

    await unresolve(db, 'A')

    expect(db.contract).toMatchObject({ isResolved: false, subsidyPool: 0 })
    expect(answerById(db, 'A').subsidyPool).toBe(57)
    // Resolved again, A pays out what it did the first time; B's stands.
    await resolve(db, 'A', 'YES')
    expect(db.balances[provider]).toBe(67 + 160)
  })

  describe("ignores the snapshots in the market's edits", () => {
    // A resolved at its first edit below's time, with B and C open; what an
    // edit says doesn't change what goes back.
    it.each([
      [
        "another resolution's, recorded late",
        // It committed before A's but recorded after, showing A open, with
        // more in the market's pool and less in A's.
        [{ createdTime: 2e12, pool: 90, a: 1, resolved: [] as string[] }],
      ],
      [
        'reordered ones',
        // Answers unresolved between resolutions leave fewer resolved in a
        // later edit.
        [
          { createdTime: 2e12, pool: 12, a: 2, resolved: ['B', 'C'] },
          { createdTime: 2e12 + 1, pool: 70, a: 9, resolved: [] as string[] },
        ],
      ],
    ])('%s', async (_, edits) => {
      const db = threeAnswers()
      db.edits = edits.map(({ createdTime, pool, a, resolved }) => ({
        createdTime,
        updatedKeys: ['id', 'subsidyPool', 'answers'],
        data: {
          isResolved: false,
          subsidyPool: pool,
          answers: ['A', 'B', 'C'].map((id) => ({
            id,
            subsidyPool: id === 'A' ? a : 0,
            resolutionTime: resolved.includes(id) ? 1 : undefined,
          })),
        },
      }))
      await resolve(db, 'A', 'YES')
      drizzle(db)

      await unresolve(db, 'A')

      expect(answerById(db, 'A').subsidyPool).toBe(36)
      expect(db.contract.subsidyPool).toBe(0)
    })
  })

  it('puts back what a resolution that paid nobody took, reverting nothing', async () => {
    const db = indieMarket(
      30,
      [answer('A', { subsidyPool: 4 }), answer('B'), answer('C')],
      [toAnswer('B', 20)]
    )
    await resolve(db, 'A', 'YES')

    await unresolve(db, 'A')

    expect(answerById(db, 'A').subsidyPool).toBe(14)
    expect(db.contract.subsidyPool).toBe(20)
    expect(txnsOf(db, 'CONTRACT_UNDO_RESOLUTION_PAYOUT')).toEqual([])
  })

  it("doesn't revert an undone resolution's payouts again", async () => {
    const db = indieMarket(0, [answer('A'), answer('B')], [toAnswer('A', 20)])
    await resolve(db, 'A', 'YES')
    await unresolve(db, 'A')
    // Trading has since all but emptied A's NO pool, so resolving NO pays
    // nobody.
    answerById(db, 'A').poolNo = 0.0001
    await resolve(db, 'A', 'NO')
    expect(txnsOf(db, 'CONTRACT_RESOLUTION_PAYOUT')).toHaveLength(1)

    await unresolve(db, 'A')

    expect(db.balances[provider]).toBe(0)
    expect(txnsOf(db, 'CONTRACT_UNDO_RESOLUTION_PAYOUT')).toHaveLength(1)
  })

  it('puts back nothing for a resolution from before the records', async () => {
    const db = indieMarket(
      0,
      [answer('A', { subsidyPool: 5 }), answer('B')],
      [toAnswer('A', 20)]
    )
    // Recorded, then undone: its record mustn't count for a later resolution.
    await resolve(db, 'A', 'YES')
    await unresolve(db, 'A')
    expect(answerById(db, 'A').subsidyPool).toBe(5)
    // Resolved again by code that wrote payouts and no record.
    const a = answerById(db, 'A')
    Object.assign(a, { resolution: 'YES', resolutionTime: Date.now() })
    a.subsidyPool = 0
    db.balances[provider] += 15
    insert(db, [
      {
        category: 'CONTRACT_RESOLUTION_PAYOUT',
        fromType: 'CONTRACT',
        fromId: M,
        toType: 'USER',
        toId: provider,
        amount: 15,
        token: 'M$',
        data: { deposit: 15, payoutStartTime: Date.now(), answerId: 'A' },
      },
    ])

    await unresolve(db, 'A')

    // Never more than it took, which nothing recorded.
    expect(answerById(db, 'A').subsidyPool).toBe(0)
    // Its payouts are the latest, reverted as before.
    expect(db.balances[provider]).toBe(0)
    expect(txnsOf(db, 'CONTRACT_UNDO_RESOLUTION_PAYOUT')).toHaveLength(2)
  })

  it('puts nothing back once the answer holds another resolution', async () => {
    const db = threeAnswers()
    await resolve(db, 'A', 'YES')
    // Another request unresolves and resolves A again meanwhile.
    db.afterResolutionRead = () => {
      answerById(db, 'A').resolutionTime = Date.now()
    }

    await expect(unresolve(db, 'A')).rejects.toThrow()

    expect(answerById(db, 'A').subsidyPool).toBe(0)
  })
})

it('restores a whole market from its last unresolved snapshot, as before', async () => {
  const db: Db = {
    contract: {
      id: M,
      creatorId,
      mechanism: 'cpmm-1',
      outcomeType: 'BINARY',
      token: 'MANA',
      visibility: 'public',
      pool: { YES: 100, NO: 100 },
      p: 0.5,
      isResolved: true,
      resolutionTime: Date.now(),
      resolution: 'YES',
      subsidyPool: 0,
    },
    answers: [],
    liquidities: [],
    txns: [],
    edits: [
      {
        createdTime: 1,
        updatedKeys: ['id', 'isResolved', 'subsidyPool'],
        data: { isResolved: false, subsidyPool: 40, answers: [] },
      },
    ],
    balances: {},
  }

  await unresolve(db)

  expect(db.contract.subsidyPool).toBe(40)
})

describe('getResolutionSubsidyToRestore', () => {
  it("adds the answer's own and its share of the market's", () => {
    expect(
      getResolutionSubsidyToRestore({
        answerSubsidyPool: 6,
        contractSubsidyShare: 30,
      })
    ).toBe(36)
  })

  it('is zero without a record', () => {
    expect(getResolutionSubsidyToRestore(null)).toBe(0)
  })

  it('counts only finite, positive amounts', () => {
    expect(
      getResolutionSubsidyToRestore({
        answerSubsidyPool: null,
        contractSubsidyShare: 5,
      })
    ).toBe(5)
    expect(
      getResolutionSubsidyToRestore({
        answerSubsidyPool: -3,
        contractSubsidyShare: NaN,
      })
    ).toBe(0)
  })
})
