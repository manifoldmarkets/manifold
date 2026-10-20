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

// An earlier resolution of the answer, from its payouts until the unresolve
// that reverted them.
type UndoneResolution = { started: number; undone: number }

// The guard's lookup, honouring each predicate its SQL states, so dropping one
// changes what it finds.
const liquidityAddedWhileResolved = (
  sql: string,
  params: unknown[],
  provisions: Provision[],
  undone: UndoneResolution[]
) => {
  const resolvedAt = params[1] as number
  const readsUndone = /from resolutions r/.test(sql)
  return provisions.some(
    (p) =>
      (!/data->>'answerId' is null/.test(sql) || p.answerId === undefined) &&
      (!/data->'answerIds' is null/.test(sql) || p.answerIds === undefined) &&
      (p.createdTime > resolvedAt ||
        (readsUndone &&
          undone.some(
            (r) => p.createdTime > r.started && p.createdTime < r.undone
          )))
  )
}

const fakeTx = (
  provisions: Provision[],
  resolvedAt: number,
  undone: UndoneResolution[]
) => {
  const updatedAnswers: string[] = []
  const tx = {
    // Like pg-promise, the mapper is called with null when no row matches.
    oneOrNone: jest.fn(
      async (sql: string, params: unknown[], cb?: (r: any) => unknown) => {
        const r = /from contract_liquidity/.test(sql)
          ? {
              added: liquidityAddedWhileResolved(
                sql,
                params,
                provisions,
                undone
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
    undone = [] as UndoneResolution[],
  } = {}
) => {
  const { tx, updatedAnswers } = fakeTx(provisions, resolvedAt, undone)
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

  describe('after an earlier resolution was undone', () => {
    // Resolved half an hour ago, unresolved 20 minutes later, and resolved
    // again a minute ago.
    const undone = [
      { started: Date.now() - 30 * MINUTE, undone: Date.now() - 10 * MINUTE },
    ]

    it('is refused when the liquidity came during that resolution', async () => {
      const { result } = await run(
        [{ createdTime: Date.now() - 20 * MINUTE }],
        {
          resolvedAt,
          undone,
        }
      )
      await expect(result).rejects.toThrow('Liquidity was added')
    })

    it('goes ahead when the liquidity came while it was open again', async () => {
      const { result } = await run([{ createdTime: Date.now() - 5 * MINUTE }], {
        resolvedAt,
        undone,
      })
      await expect(result).resolves.toMatchObject({ success: true })
    })
  })
})
