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

import { MOD_IDS } from 'common/envs/constants'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getContract, getUser } from 'shared/utils'
import { insertTxns } from 'shared/txn/run-txn'
import { unresolveMain } from './unresolve'

const creatorId = 'creator'
const modId = MOD_IDS[0]
const MINUTE = 60 * 1000

// A row of contract_liquidity, as the guard's SQL reads it.
type Provision = {
  answerId?: string
  answerIds?: string[]
  createdTime: number
}

// The guard's lookup, honouring each predicate its SQL states, so dropping one
// changes what it finds. The answer's first resolution comes from its
// resolution payouts, when the SQL reads them.
const liquidityAddedSince = (
  sql: string,
  params: unknown[],
  provisions: Provision[],
  firstResolvedAt: number | undefined
) => {
  const resolvedAt = params[1] as number
  const since =
    /least\(\$2, \(\s*select min\(\(data->'data'->>'payoutStartTime'\)/.test(
      sql
    ) && firstResolvedAt !== undefined
      ? Math.min(resolvedAt, firstResolvedAt)
      : resolvedAt
  return provisions.some(
    (p) =>
      (!/data->>'answerId' is null/.test(sql) || p.answerId === undefined) &&
      (!/data->'answerIds' is null/.test(sql) || p.answerIds === undefined) &&
      (!/created_time > millis_to_ts\(/.test(sql) || p.createdTime > since)
  )
}

const fakeTx = (
  provisions: Provision[],
  resolvedAt: number,
  firstResolvedAt: number | undefined
) => {
  const updatedAnswers: string[] = []
  const tx = {
    // Like pg-promise, the mapper is called with null when no row matches.
    oneOrNone: jest.fn(
      async (sql: string, params: unknown[], cb?: (r: any) => unknown) => {
        const r = /from contract_liquidity/.test(sql)
          ? {
              added: liquidityAddedSince(
                sql,
                params,
                provisions,
                firstResolvedAt
              ),
            }
          : /from contract_edits/.test(sql)
          ? null
          : /from answers/.test(sql)
          ? { resolution_time: resolvedAt }
          : null
        return cb ? cb(r) : r
      }
    ),
    one: jest.fn(async (sql: string, params: unknown[]) => {
      if (/update answers/.test(sql)) {
        updatedAnswers.push(params[0] as string)
        return { id: params[0] }
      }
      throw new Error(`unexpected: ${sql}`)
    }),
    map: jest.fn(async () => []),
    many: jest.fn(async () => []),
  }
  return { tx, updatedAnswers }
}

const run = async (
  provisions: Provision[],
  {
    userId = creatorId,
    resolvedAt = Date.now() - MINUTE,
    firstResolvedAt = undefined as number | undefined,
  } = {}
) => {
  const { tx, updatedAnswers } = fakeTx(provisions, resolvedAt, firstResolvedAt)
  ;(createSupabaseDirectClient as jest.Mock).mockReturnValue({
    tx: (fn: (t: typeof tx) => unknown) => fn(tx),
  })
  ;(getContract as jest.Mock).mockResolvedValue({
    id: 'M',
    creatorId,
    mechanism: 'cpmm-multi-1',
    outcomeType: 'MULTIPLE_CHOICE',
    shouldAnswersSumToOne: false,
    token: 'MANA',
    visibility: 'public',
    isResolved: false,
    answers: [],
  })
  ;(getUser as jest.Mock).mockResolvedValue({ id: userId })
  const result = unresolveMain(
    { contractId: 'M', answerId: 'A' },
    { uid: userId } as any,
    {} as any
  )
  return { result, updatedAnswers }
}

beforeEach(() => jest.clearAllMocks())

describe('unresolving an answer of an independent multiple choice market', () => {
  const resolvedAt = Date.now() - MINUTE

  it('is refused once unrecorded whole-market liquidity came after it resolved', async () => {
    const { result, updatedAnswers } = await run(
      [{ createdTime: resolvedAt + 30 * 1000 }],
      { resolvedAt }
    )
    await expect(result).rejects.toThrow(
      'Liquidity was added to the whole market after this answer resolved'
    )
    expect(insertTxns).not.toHaveBeenCalled()
    expect(updatedAnswers).toEqual([])
  })

  it('is refused to mods too', async () => {
    const hourAgo = Date.now() - 60 * MINUTE
    const { result } = await run([{ createdTime: hourAgo + MINUTE }], {
      userId: modId,
      resolvedAt: hourAgo,
    })
    await expect(result).rejects.toThrow('Liquidity was added')
  })

  it('goes ahead when the later whole-market liquidity recorded its answers', async () => {
    const { result, updatedAnswers } = await run(
      [{ createdTime: resolvedAt + 30 * 1000, answerIds: ['B'] }],
      { resolvedAt }
    )
    await expect(result).resolves.toMatchObject({ success: true })
    expect(updatedAnswers).toEqual(['A'])
  })

  it('goes ahead when the later liquidity went to a single answer', async () => {
    const { result } = await run(
      [{ createdTime: resolvedAt + 30 * 1000, answerId: 'B' }],
      { resolvedAt }
    )
    await expect(result).resolves.toMatchObject({ success: true })
  })

  it('goes ahead when the whole-market liquidity came before it resolved', async () => {
    const { result } = await run([{ createdTime: resolvedAt - 30 * 1000 }], {
      resolvedAt,
    })
    await expect(result).resolves.toMatchObject({ success: true })
  })

  it('is refused when the liquidity came during an earlier resolution, since undone', async () => {
    // Resolved half an hour ago, unresolved, and resolved again a minute ago.
    const firstResolvedAt = Date.now() - 30 * MINUTE
    const { result } = await run([{ createdTime: firstResolvedAt + MINUTE }], {
      resolvedAt,
      firstResolvedAt,
    })
    await expect(result).rejects.toThrow('Liquidity was added')
  })
})
