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
import {
  getAnswerSubsidyToRestore,
  getPayoutResolution,
  getRecordToUndo,
  tookMarketSubsidy,
  unresolveMain,
} from './unresolve'

const M = 'M'
const creatorId = 'creator'
const provider = 'provider'

type TxnData = Omit<Txn, 'id' | 'createdTime'>
type StoredTxn = TxnData & { id: string; createdTime: number }

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
const contractOf = (db: Db): Record<string, unknown> =>
  JSON.parse(JSON.stringify({ ...db.contract, answers: db.answers }))
// Txns some txn of this category names as reverted.
const revertedBy = (db: Db, category: string) =>
  new Set(txnsOf(db, category).map((t) => t.data?.revertsTxnId as string))

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

const insert = (db: Db, txns: TxnData[]) => {
  for (const t of txns)
    db.txns.push({ ...t, id: `t${db.txns.length}`, createdTime: Date.now() })
}

// As bulkIncrementBalancesQuery's SQL applies them: summed per user, one row
// back for each.
const applyBalances = (db: Db, statement: string) => {
  const updates = JSON.parse(statement.slice('BALANCES '.length)) as {
    id: string
    balance?: number
  }[]
  for (const { id, balance } of updates)
    db.balances[id] = (db.balances[id] ?? 0) + (balance ?? 0)
  return [...new Set(updates.map((u) => u.id))].map((id) => ({
    id,
    balance: db.balances[id],
  }))
}

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

  // An answer's resolution records, as its query states which: those not
  // marked undone, nor with all their payouts (by the id they share)
  // reverted.
  const readRecords = (sql: string, [answerId, contractId]: unknown[]) => {
    const skipsMarked = /'CONTRACT_UNDO_RESOLUTION_SUBSIDY'/.test(sql)
    const skipsReverted =
      /resolution_id = t\.data->'data'->>'resolutionId'\s+and not reverted/.test(
        sql
      )
    const marked = revertedBy(db, 'CONTRACT_UNDO_RESOLUTION_SUBSIDY')
    const reverted = revertedBy(db, 'CONTRACT_UNDO_RESOLUTION_PAYOUT')
    const rows = txnsOf(db, 'CONTRACT_RESOLUTION_SUBSIDY')
      .filter((t) => {
        if (
          t.fromId !== contractId ||
          t.toId !== contractId ||
          t.data?.answerId !== answerId
        )
          return false
        if (skipsMarked && marked.has(t.id)) return false
        const payouts = txnsOf(db, 'CONTRACT_RESOLUTION_PAYOUT').filter(
          (p) =>
            p.fromId === contractId &&
            p.data?.answerId === answerId &&
            p.data?.resolutionId === t.data?.resolutionId
        )
        return (
          !skipsReverted ||
          payouts.length === 0 ||
          payouts.some((p) => !reverted.has(p.id))
        )
      })
      .map((t) => ({
        id: t.id,
        resolution_id: t.data?.resolutionId ?? null,
        resolution_time: t.data?.resolutionTime ?? null,
        answer_subsidy_pool: t.data?.answerSubsidyPool ?? null,
        contract_subsidy_share: t.data?.contractSubsidyShare ?? null,
      }))
    db.afterResolutionRead?.()
    return rows
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

  // An answer's payouts, as its query states which: those not yet reverted.
  const answerPayouts = (sql: string, [contractId, answerId]: unknown[]) => {
    const skipsReverted = /'CONTRACT_UNDO_RESOLUTION_PAYOUT'/.test(sql)
    const skipsFlagged = /->>'reverted'/.test(sql)
    const reverted = revertedBy(db, 'CONTRACT_UNDO_RESOLUTION_PAYOUT')
    return txnsOf(db, 'CONTRACT_RESOLUTION_PAYOUT').filter(
      (t) =>
        t.fromId === contractId &&
        t.data?.answerId === answerId &&
        (!skipsReverted || !reverted.has(t.id)) &&
        (!skipsFlagged || t.data?.reverted !== true)
    )
  }
  // A market's payouts: those of one payoutStartTime, if given.
  const marketPayouts = ([contractId, payoutStartTime, answerId]: unknown[]) =>
    txnsOf(db, 'CONTRACT_RESOLUTION_PAYOUT').filter(
      (t) =>
        t.fromId === contractId &&
        (payoutStartTime == null ||
          t.data?.payoutStartTime === payoutStartTime) &&
        (answerId == null || t.data?.answerId === answerId)
    )

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
      async (sql: string, params: unknown[], cb?: (r: unknown) => unknown) => {
        const r = oneOrNoneRow(sql, params)
        return cb ? cb(r) : r
      }
    ),
    one: jest.fn(
      async (sql: string, params: unknown[], cb?: (r: unknown) => unknown) => {
        if (!/update answers/.test(sql)) throw new Error(`unexpected: ${sql}`)
        const r = updateAnswerRow(sql, params)
        if (!r) throw new Error('No data returned from the query.')
        return cb ? cb(r) : r
      }
    ),
    map: jest.fn(
      async (sql: string, params: unknown[], cb: (r: unknown) => unknown) => {
        // Before payouts: the records' query reads them too.
        if (/category = 'CONTRACT_RESOLUTION_SUBSIDY'/.test(sql))
          return readRecords(sql, params).map(cb)
        if (!/category = 'CONTRACT_RESOLUTION_PAYOUT'/.test(sql)) return []
        const payouts = /from txns p\b/.test(sql)
          ? answerPayouts(sql, params)
          : marketPayouts(params)
        return payouts.map(txnRow).map(cb)
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
            insert(db, JSON.parse(s.slice('INSERT txns '.length)) as TxnData[])
            return []
          }
          if (s.startsWith('UPDATE ')) {
            const {
              id: _id,
              answers: _answers,
              ...attrs
            } = JSON.parse(s.slice('UPDATE '.length)) as Record<string, unknown>
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
    async (_pg: unknown, txns: TxnData[]) => insert(db, txns)
  )
  // As recordContractEdit records it, after the transaction: the contract it
  // was given.
  ;(recordContractEdit as jest.Mock).mockImplementation(
    async (contract: Edit['data'], _userId: string, updatedKeys: string[]) =>
      db.edits.push({
        createdTime: Date.now(),
        updatedKeys,
        data: JSON.parse(JSON.stringify(contract)) as Edit['data'],
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
    { uid: creatorId } as Parameters<typeof unresolveMain>[1],
    {} as Parameters<typeof unresolveMain>[2]
  )
}

// A resolution by the code from before the records: its payouts, no record.
// The rows a resolution leaves that resolveMarketHelper, as it is, can't: one
// by the code from before the records (no record), or a second over a
// standing one, as two concurrent resolutions could before the answer was
// checked in the transaction.
const writeResolution = (
  db: Db,
  answerId: string,
  payouts: number[],
  {
    resolutionTime = Date.now(),
    payoutStartTime = Date.now(),
    record,
  }: {
    resolutionTime?: number
    payoutStartTime?: number
    record?: { answerSubsidyPool: number; contractSubsidyShare: number }
  } = {}
) => {
  Object.assign(answerById(db, answerId), {
    resolution: 'YES',
    resolutionTime,
    subsidyPool: 0,
  })
  for (const payout of payouts)
    db.balances[provider] = (db.balances[provider] ?? 0) + payout
  // As resolveMarketHelper ties a recorded resolution's payouts to its record.
  const resolutionId = record ? `r${db.txns.length}` : undefined
  insert(db, [
    ...payouts.map(
      (payout): TxnData => ({
        category: 'CONTRACT_RESOLUTION_PAYOUT',
        fromType: 'CONTRACT',
        fromId: M,
        toType: 'USER',
        toId: provider,
        amount: payout,
        token: 'M$',
        data: { deposit: payout, payoutStartTime, answerId, resolutionId },
      })
    ),
    ...(record
      ? [
          {
            category: 'CONTRACT_RESOLUTION_SUBSIDY',
            fromType: 'CONTRACT',
            fromId: M,
            toType: 'CONTRACT',
            toId: M,
            amount: 0,
            token: 'M$',
            data: {
              answerId,
              resolutionId,
              payoutStartTime,
              resolutionTime,
              ...record,
            },
          } as TxnData,
        ]
      : []),
  ])
}

// An unresolve by the code from before the records: it reverts the answer's
// payouts and puts back its pool from a snapshot, marking no record.
const unresolveWithoutRecords = (
  db: Db,
  answerId: string,
  subsidyPool: number
) => {
  const reverted = revertedBy(db, 'CONTRACT_UNDO_RESOLUTION_PAYOUT')
  const payouts = txnsOf(db, 'CONTRACT_RESOLUTION_PAYOUT').filter(
    (p) => p.data?.answerId === answerId && !reverted.has(p.id)
  )
  for (const p of payouts) db.balances[p.toId] -= p.amount
  insert(
    db,
    payouts.map(
      (p): TxnData => ({
        category: 'CONTRACT_UNDO_RESOLUTION_PAYOUT',
        fromType: 'USER',
        fromId: p.toId,
        toType: 'CONTRACT',
        toId: M,
        amount: p.amount,
        token: 'M$',
        data: { revertsTxnId: p.id },
      })
    )
  )
  const a = answerById(db, answerId)
  delete a.resolution
  delete a.resolutionTime
  a.subsidyPool = subsidyPool
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

// Three answers sharing a whole-market provision of 90, and 6 of A's own
// pending subsidy. The market's own pool holds `pool`.
const threeAnswers = (pool = 0) =>
  indieMarket(
    pool,
    [answer('A', { subsidyPool: 6 }), answer('B'), answer('C')],
    [wholeMarket(90)]
  )

const refusal = "took part of the market's pending subsidy"
const moreThanOne = 'more than one resolution'

let clock: number
let dateNow: jest.SpyInstance
let consoleLog: jest.SpyInstance
beforeEach(() => {
  jest.clearAllMocks()
  // Every call a millisecond on, unless a test holds it.
  clock = 1_800_000_000_000
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
    const db = threeAnswers(90)
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
          resolutionId: payout.data?.resolutionId,
          payoutStartTime: payout.data?.payoutStartTime,
          resolutionTime: answerById(db, 'A').resolutionTime,
          answerSubsidyPool: 6,
          contractSubsidyShare: 30,
        },
      }),
    ])
    expect(payout.data?.resolutionId).toEqual(expect.any(String))
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
  it("is refused once its resolution took part of the market's pending subsidy", async () => {
    // A and B have M$10 of liquidity each, and M$100 more is still pending in
    // the market's pool: M$120 in all.
    const db = indieMarket(
      100,
      [answer('A'), answer('B')],
      [toAnswer('A', 10), toAnswer('B', 10), wholeMarket(100)]
    )
    await resolve(db, 'A', 'YES')
    expect(db.balances[provider]).toBe(60)

    await expect(unresolve(db, 'A')).rejects.toThrow(refusal)

    expect(answerById(db, 'A')).toMatchObject({ resolution: 'YES' })
    // Cancelling B refunds its M$10 and its half of the M$100: M$120 out,
    // as went in. Reopened, A would have taken a share of B's half again.
    await resolve(db, 'B', 'CANCEL')
    expect(db.balances[provider]).toBe(120)
  })

  it('is refused on what the resolution took, though the pool has drained since', async () => {
    const db = threeAnswers(90)
    await resolve(db, 'A', 'YES')
    drizzle(db)

    await expect(unresolve(db, 'A')).rejects.toThrow(refusal)
    expect(txnsOf(db, 'CONTRACT_UNDO_RESOLUTION_PAYOUT')).toEqual([])
  })

  it('puts back its own pending subsidy when it took none of the market', async () => {
    const db = threeAnswers()
    await resolve(db, 'A', 'YES')
    expect(db.balances[provider]).toBe(16)

    await unresolve(db, 'A')

    expect(db.balances[provider]).toBe(0)
    expect(answerById(db, 'A')).toMatchObject({ subsidyPool: 6 })
    expect(answerById(db, 'A').resolutionTime).toBeUndefined()
    expect(db.contract.subsidyPool).toBe(0)
    // Its record, undone.
    const [record] = txnsOf(db, 'CONTRACT_RESOLUTION_SUBSIDY')
    expect(txnsOf(db, 'CONTRACT_UNDO_RESOLUTION_SUBSIDY')).toEqual([
      expect.objectContaining({ amount: 0, data: { revertsTxnId: record.id } }),
    ])
  })

  it('then pays out on a cancellation what a cancellation alone pays', async () => {
    const cancelled = threeAnswers()
    await resolve(cancelled, 'A', 'CANCEL')
    await resolve(cancelled, 'B', 'YES')
    await resolve(cancelled, 'C', 'YES')

    const undone = threeAnswers()
    await resolve(undone, 'A', 'YES')
    await unresolve(undone, 'A')
    await resolve(undone, 'A', 'CANCEL')
    await resolve(undone, 'B', 'YES')
    await resolve(undone, 'C', 'YES')

    // The refund of A's third, 30, and B and C's pools of 10.
    expect(cancelled.balances[provider]).toBe(50)
    expect(undone.balances[provider]).toBe(50)
  })

  it('reopens the market when it had resolved it, leaving later answers be', async () => {
    const db = indieMarket(
      0,
      [answer('A', { subsidyPool: 7 }), answer('B')],
      [wholeMarket(100)]
    )
    await resolve(db, 'A', 'YES')
    await resolve(db, 'B', 'YES')
    expect(db.contract).toMatchObject({ isResolved: true })
    expect(db.balances[provider]).toBe(17 + 10)

    await unresolve(db, 'A')

    expect(db.contract).toMatchObject({ isResolved: false, subsidyPool: 0 })
    expect(answerById(db, 'A').subsidyPool).toBe(7)
    // Resolved again, A pays out what it did the first time; B's stands.
    await resolve(db, 'A', 'YES')
    expect(db.balances[provider]).toBe(17 + 10)
  })

  describe("decides on the record, not the market's edits", () => {
    // Snapshots of the market as resolutions found it, showing A open: a
    // late one, which another resolution that committed first recorded after
    // A's, and reordered ones, which answers unresolved meanwhile leave with
    // fewer answers resolved.
    const snapshots = (
      edits: { createdTime: number; pool: number; resolved: string[] }[]
    ): Edit[] =>
      edits.map(({ createdTime, pool, resolved }) => ({
        createdTime,
        updatedKeys: ['id', 'subsidyPool', 'answers'],
        data: {
          isResolved: false,
          subsidyPool: pool,
          answers: ['A', 'B', 'C'].map((id) => ({
            id,
            subsidyPool: id === 'A' ? 1 : 0,
            resolutionTime: resolved.includes(id) ? 1 : undefined,
          })),
        },
      }))
    const late = [{ createdTime: 2e12, pool: 90, resolved: [] }]
    const reordered = [
      { createdTime: 2e12, pool: 12, resolved: ['B', 'C'] },
      { createdTime: 2e12 + 1, pool: 70, resolved: [] },
    ]

    it.each([
      ['a late snapshot', late],
      ['reordered snapshots', reordered],
    ])('puts back what the record says, with %s', async (_, edits) => {
      const db = threeAnswers()
      db.edits = snapshots(edits)
      await resolve(db, 'A', 'YES')

      await unresolve(db, 'A')

      expect(answerById(db, 'A').subsidyPool).toBe(6)
      expect(db.contract.subsidyPool).toBe(0)
    })

    it('refuses on the record, though a snapshot shows an empty pool', async () => {
      const db = threeAnswers(90)
      db.edits = snapshots([{ createdTime: 2e12, pool: 0, resolved: [] }])
      await resolve(db, 'A', 'YES')

      await expect(unresolve(db, 'A')).rejects.toThrow(refusal)
    })
  })

  it('puts back what a resolution that paid nobody took, reverting nothing', async () => {
    const db = indieMarket(
      0,
      [answer('A', { subsidyPool: 4 }), answer('B'), answer('C')],
      [toAnswer('B', 20)]
    )
    await resolve(db, 'A', 'YES')

    await unresolve(db, 'A')

    expect(answerById(db, 'A').subsidyPool).toBe(4)
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

  it('reverts only payouts not yet reverted, whatever their payoutStartTime', async () => {
    const db = indieMarket(0, [answer('A'), answer('B')], [toAnswer('A', 20)])
    await resolve(db, 'A', 'YES')
    const first = txnsOf(db, 'CONTRACT_RESOLUTION_PAYOUT')[0]
    await unresolve(db, 'A')
    // Resolved again on a clock a little behind: its payouts carry an earlier
    // payoutStartTime than the first resolution's.
    writeResolution(db, 'A', [20], {
      payoutStartTime: (first.data?.payoutStartTime as number) - 10,
    })

    await unresolve(db, 'A')

    expect(db.balances[provider]).toBe(0)
    expect(txnsOf(db, 'CONTRACT_UNDO_RESOLUTION_PAYOUT')).toHaveLength(2)
  })

  it('reverts each of two resolutions in the same millisecond once', async () => {
    const db = indieMarket(
      0,
      [answer('A', { subsidyPool: 3 }), answer('B')],
      [toAnswer('A', 20)]
    )
    const at = clock
    const atOneTime = (fn: () => Promise<unknown>) => {
      dateNow.mockImplementation(() => at)
      return fn().finally(() => dateNow.mockImplementation(() => (clock += 1)))
    }
    await atOneTime(() => resolve(db, 'A', 'YES'))
    await unresolve(db, 'A')
    await atOneTime(() => resolve(db, 'A', 'YES'))
    const [first, second] = txnsOf(db, 'CONTRACT_RESOLUTION_SUBSIDY')
    // The same times, told apart only by their ids.
    expect(second.data?.resolutionTime).toBe(first.data?.resolutionTime)
    expect(second.data?.payoutStartTime).toBe(first.data?.payoutStartTime)
    expect(second.data?.resolutionId).not.toBe(first.data?.resolutionId)

    await unresolve(db, 'A')

    expect(db.balances[provider]).toBe(0)
    expect(txnsOf(db, 'CONTRACT_UNDO_RESOLUTION_PAYOUT')).toHaveLength(2)
    expect(answerById(db, 'A').subsidyPool).toBe(3)
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
    writeResolution(db, 'A', [15])

    await unresolve(db, 'A')

    // Never more than it took, which nothing recorded.
    expect(answerById(db, 'A').subsidyPool).toBe(0)
    // Its payouts are reverted as before.
    expect(db.balances[provider]).toBe(0)
    expect(txnsOf(db, 'CONTRACT_UNDO_RESOLUTION_PAYOUT')).toHaveLength(2)
  })

  it('never reads an undone record again, even in the same millisecond', async () => {
    const db = indieMarket(
      0,
      [answer('A', { subsidyPool: 5 }), answer('B')],
      [toAnswer('A', 20)]
    )
    await resolve(db, 'A', 'YES')
    const resolvedAt = answerById(db, 'A').resolutionTime
    await unresolve(db, 'A')
    // Resolved again, without a record, at the first resolution's time.
    writeResolution(db, 'A', [15], { resolutionTime: resolvedAt })

    await unresolve(db, 'A')

    expect(answerById(db, 'A').subsidyPool).toBe(0)
  })

  it('treats a record whose payouts were all reverted as undone', async () => {
    // A's pools are worth 10, and 100 of its own subsidy is pending.
    const db = indieMarket(
      0,
      [answer('A', { subsidyPool: 100 }), answer('B')],
      [toAnswer('A', 20)]
    )
    await resolve(db, 'A', 'YES')
    const [record] = txnsOf(db, 'CONTRACT_RESOLUTION_SUBSIDY')
    // Undone by code that marks no records, which puts back the 100. The
    // drizzle then spends 20 of it, and code without records resolves A
    // again, its clocks reading the same milliseconds as the first's.
    unresolveWithoutRecords(db, 'A', 100)
    answerById(db, 'A').subsidyPool = 80
    writeResolution(db, 'A', [110], {
      resolutionTime: record.data?.resolutionTime,
      payoutStartTime: record.data?.payoutStartTime,
    })

    await unresolve(db, 'A')

    // Not the first resolution's 100: what the second took isn't recorded.
    expect(answerById(db, 'A').subsidyPool).toBe(0)
    expect(db.balances[provider]).toBe(0)
  })

  it('is refused while another of its resolutions stands', async () => {
    const db = indieMarket(
      0,
      [answer('A', { subsidyPool: 100 }), answer('B')],
      [toAnswer('A', 20)]
    )
    await resolve(db, 'A', 'YES')
    // Resolved again over the first, which took the 100, so the second took
    // nothing and paid only the pools' 10.
    writeResolution(db, 'A', [10], {
      record: { answerSubsidyPool: 0, contractSubsidyShare: 0 },
    })

    await expect(unresolve(db, 'A')).rejects.toThrow(moreThanOne)

    expect(db.balances[provider]).toBe(120)
    expect(txnsOf(db, 'CONTRACT_UNDO_RESOLUTION_PAYOUT')).toEqual([])
  })

  it('is refused while payouts of two resolutions stand', async () => {
    const db = indieMarket(0, [answer('A'), answer('B')], [toAnswer('A', 20)])
    writeResolution(db, 'A', [110])
    writeResolution(db, 'A', [10])

    await expect(unresolve(db, 'A')).rejects.toThrow(moreThanOne)
  })

  it("holds each user's payouts together to the negative balance limit", async () => {
    const db = indieMarket(0, [answer('A'), answer('B')], [toAnswer('A', 20)])
    // One resolution, from before payouts were merged per user: two of 800
    // to one provider, who has since spent all but 100.
    writeResolution(db, 'A', [800, 800])
    db.balances[provider] = 100

    await expect(unresolve(db, 'A')).rejects.toThrow('Negative balances')
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

describe('getPayoutResolution', () => {
  it("is a recorded resolution's id, or an older payout's start time", () => {
    const data = { payoutStartTime: 120 }
    expect(getPayoutResolution({ data: { ...data, resolutionId: 'r' } })).toBe(
      'r'
    )
    expect(getPayoutResolution({ data })).toBe(120)
    expect(getPayoutResolution({})).toBeNull()
  })
})

describe('getRecordToUndo', () => {
  const record = { resolutionTime: 100, resolutionId: 'r' }

  it("is the current resolution's record, with or without its payouts", () => {
    expect(getRecordToUndo(100, [record], ['r', 'r'])).toBe(record)
    expect(getRecordToUndo(100, [record], [])).toBe(record)
  })

  it('is none for a resolution from before the records', () => {
    expect(getRecordToUndo(100, [], [90, 90])).toBeNull()
    expect(getRecordToUndo(100, [], [null])).toBeNull()
  })

  it('refuses more than one resolution not undone', () => {
    expect(() => getRecordToUndo(100, [record, record], [])).toThrow(
      moreThanOne
    )
    expect(() => getRecordToUndo(100, [], [90, 120])).toThrow(moreThanOne)
    expect(() => getRecordToUndo(100, [], [90, null])).toThrow(moreThanOne)
    // Another resolution's record, or another resolution's payouts, even in
    // the record's millisecond.
    expect(() => getRecordToUndo(200, [record], [])).toThrow(moreThanOne)
    expect(() => getRecordToUndo(100, [record], [90])).toThrow(moreThanOne)
    expect(() => getRecordToUndo(100, [record], ['r', 100])).toThrow(
      moreThanOne
    )
  })
})

describe('tookMarketSubsidy', () => {
  it("is true for a positive share of the market's pool", () => {
    expect(tookMarketSubsidy({ contractSubsidyShare: 0.01 })).toBe(true)
  })

  it('is false for none', () => {
    expect(tookMarketSubsidy({ contractSubsidyShare: 0 })).toBe(false)
  })

  it('is true when the record holds no usable amount', () => {
    expect(tookMarketSubsidy({ contractSubsidyShare: null })).toBe(true)
    expect(tookMarketSubsidy({ contractSubsidyShare: NaN })).toBe(true)
  })
})

describe('getAnswerSubsidyToRestore', () => {
  it("is the answer's own, as recorded", () => {
    expect(getAnswerSubsidyToRestore({ answerSubsidyPool: 6 })).toBe(6)
  })

  it('is zero without a record', () => {
    expect(getAnswerSubsidyToRestore(null)).toBe(0)
  })

  it('counts only a finite, positive amount', () => {
    expect(getAnswerSubsidyToRestore({ answerSubsidyPool: null })).toBe(0)
    expect(getAnswerSubsidyToRestore({ answerSubsidyPool: -3 })).toBe(0)
    expect(getAnswerSubsidyToRestore({ answerSubsidyPool: NaN })).toBe(0)
  })
})
