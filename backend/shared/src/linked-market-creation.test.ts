// Exercise the real creation/link handlers and SQL helpers. Only external
// services and the database transport are replaced; PostgreSQL lock behavior
// is separately covered by market-links-postgres.test.ts.
jest.mock('api/helpers/rate-limit', () => ({
  onlyUsersWhoCanPerformAction: (_action: string, handler: unknown) => handler,
}))
jest.mock('api/helpers/on-create-market', () => ({}))
jest.mock('shared/utils', () => ({
  getContract: jest.fn(),
  isProd: () => false,
  htmlToRichText: () => ({ type: 'doc', content: [] }),
  log: Object.assign(jest.fn(), { error: jest.fn() }),
}))
jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(),
  pgp: { as: { format: () => 'insert contract' } },
}))
jest.mock('shared/helpers/fn-queue', () => ({
  betsQueue: { enqueueFn: jest.fn((run: () => Promise<unknown>) => run()) },
}))
jest.mock('shared/helpers/ai-close-date', () => ({ getCloseDate: jest.fn() }))
jest.mock('shared/supabase/contracts', () => ({
  getContractsDirect: jest.fn().mockResolvedValue([]),
}))
jest.mock('shared/supabase/utils', () => ({
  bulkInsertQuery: () => 'insert answers',
}))
jest.mock('shared/supabase/answers', () => ({}))
jest.mock('shared/tiptap', () => ({
  anythingToRichText: () => ({ type: 'doc', content: [] }),
}))
jest.mock('shared/create-contract-helpers', () => ({
  generateAntes: jest.fn(),
}))
jest.mock('shared/txn/run-txn', () => ({ runTxnOutsideBetQueue: jest.fn() }))
jest.mock('shared/update-group-contracts-internal', () => ({}))
jest.mock('shared/helpers/topic-matching', () => ({}))
jest.mock('shared/websockets/helpers', () => ({}))

import { createMarketHelper } from 'api/create-market'
import { linkMarket } from 'api/link-market'
import { AuthedUser } from 'api/helpers/endpoint'
import { ValidatedAPIParams } from 'common/api/schema'
import { createMarketProps } from 'common/api/market-types'
import { Contract } from 'common/contract'
import { DEV_HOUSE_LIQUIDITY_PROVIDER_ID } from 'common/antes'
import { FREE_MARKET_USER_ID, MINIMUM_BOUNTY } from 'common/economy'
import { getCloseDate } from 'shared/helpers/ai-close-date'
import { getContractsDirect } from 'shared/supabase/contracts'
import { betsQueue } from 'shared/helpers/fn-queue'
import {
  createSupabaseDirectClient,
  SupabaseTransaction,
} from 'shared/supabase/init'
import { runTxnOutsideBetQueue } from 'shared/txn/run-txn'
import { generateAntes } from 'shared/create-contract-helpers'
import { getContract } from 'shared/utils'

const NOW = Date.parse('2026-10-15T00:00:00Z')
const parentCloseTime = NOW + 60_000
const fallbackCloseTime = NOW + 7 * 24 * 60 * 60_000
const auth = { uid: 'alice' } as AuthedUser
const body: ValidatedAPIParams<'market'> = {
  question: 'Will the linked event happen?',
  outcomeType: 'BINARY',
  visibility: 'public',
  liquidityTier: 100,
  linkedToContractId: 'game',
  idempotencyKey: 'child12345',
}
const link = linkMarket as unknown as (
  props: { contractId: string; parentContractId: string },
  auth: { uid: string }
) => Promise<unknown>

function deferred() {
  let resolve: () => void = () => undefined
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

type Parent = {
  id: string
  visibility: string
  deleted: boolean
  resolution: string | null
  close_time: string | null
}

function database(
  options: {
    afterPreflight?: () => Promise<void>
    onLockAttempt?: (transaction: number) => void
    afterLock?: (transaction: number) => Promise<void>
    beforeCommit?: (transaction: number) => Promise<void>
    onFundingLock?: (transaction: number, userId: string) => Promise<void>
  } = {}
) {
  const parents = new Map<string, Parent>(
    ['game', 'other'].map((id) => [
      id,
      {
        id,
        visibility: 'public',
        deleted: false,
        resolution: null,
        close_time: new Date(parentCloseTime).toISOString(),
      },
    ])
  )
  const links = new Map<string, string>()
  const locks = new Map<string, Promise<void>>()
  const insertAttempts: number[] = []
  const committedInserts: number[] = []
  const committedAntes: number[] = []
  const fundingLocks: string[] = []
  const pendingAntes = new Map<SupabaseTransaction, number[]>()
  let transactionCount = 0
  let userName = 'Alice'

  const oneOrNone = async (sql: string, values: string[], transaction = 0) => {
    if (sql.includes('from users')) {
      expect(sql).toMatch(/for no key update nowait/i)
      fundingLocks.push(values[0])
      await options.onFundingLock?.(transaction, values[0])
      return { id: values[0] }
    }
    if (sql.includes('select count(*) from contracts')) return { count: 0 }
    if (sql.includes('from contracts c')) {
      const parent = parents.get(values[0])
      const row = parent ? { ...parent, is_child: links.has(values[0]) } : null
      if (transaction === 0) await options.afterPreflight?.()
      return row
    }
    throw new Error('Unexpected query: ' + sql)
  }
  const pg = {
    oneOrNone,
    tx: async <T>(run: (tx: SupabaseTransaction) => Promise<T>) => {
      const transaction = ++transactionCount
      const unlocks: (() => void)[] = []
      const pendingLinks = new Map<string, string>()
      let inserted = false
      const tx = {
        manyOrNone: async (sql: string, values: string[][]) => {
          // Fail if a refactor drops row locking or deterministic lock order.
          expect(sql).toMatch(/order by id\s+for no key update/i)
          options.onLockAttempt?.(transaction)
          for (const id of [...new Set(values[0])].sort()) {
            const previous = locks.get(id) ?? Promise.resolve()
            const held = deferred()
            locks.set(id, held.promise)
            await previous
            unlocks.push(held.resolve)
          }
          await options.afterLock?.(transaction)
          return []
        },
        oneOrNone: (sql: string, values: string[]) =>
          oneOrNone(sql, values, transaction),
        one: async (sql: string, values: string[]) => {
          expect(sql).toContain('count(*)')
          return {
            count: [...links.values()].filter((id) => id === values[0]).length,
          }
        },
        multi: async (sql: string, values?: string[]) => {
          if (sql.includes('select * from users'))
            return [
              [
                {
                  id: values?.[0] ?? 'alice',
                  name: userName,
                  username: 'alice',
                  balance: 10000,
                  created_time: new Date(NOW - 86400000).toISOString(),
                  data: {},
                },
              ],
              [],
            ]
          expect(sql).toContain('insert contract')
          insertAttempts.push(transaction)
          inserted = true
          return [[], []]
        },
        none: async (sql: string, values: string[]) => {
          expect(sql).toContain('insert into market_links')
          pendingLinks.set(values[0], values[1])
        },
      } as unknown as SupabaseTransaction
      const antes: number[] = []
      pendingAntes.set(tx, antes)
      try {
        const result = await run(tx)
        await options.beforeCommit?.(transaction)
        pendingLinks.forEach((parent, child) => links.set(child, parent))
        if (inserted) committedInserts.push(transaction)
        committedAntes.push(...antes)
        return result
      } finally {
        pendingAntes.delete(tx)
        unlocks.forEach((unlock) => unlock())
      }
    },
  }
  jest
    .mocked(createSupabaseDirectClient)
    .mockReturnValue(
      pg as unknown as ReturnType<typeof createSupabaseDirectClient>
    )
  jest.mocked(getContract).mockImplementation(async (_pg, id) => {
    const parent = parents.get(id)
    return parent
      ? ({
          id,
          creatorId: 'alice',
          visibility: parent.visibility,
          deleted: parent.deleted,
        } as Contract)
      : undefined
  })
  jest.mocked(runTxnOutsideBetQueue).mockImplementation(async (tx, txn) => {
    const antes = pendingAntes.get(tx)
    if (!antes) throw new Error('Ante must be inside the creation transaction')
    antes.push(txn.amount)
    return { ...txn, id: 'ante', createdTime: NOW } as Awaited<
      ReturnType<typeof runTxnOutsideBetQueue>
    >
  })
  return {
    parents,
    links,
    insertAttempts,
    committedInserts,
    committedAntes,
    fundingLocks,
    setUserName: (name: string) => {
      userName = name
    },
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getContractsDirect).mockResolvedValue([])
  jest.spyOn(Date, 'now').mockReturnValue(NOW)
  jest
    .mocked(getCloseDate)
    .mockResolvedValue({ closeTime: fallbackCloseTime, confidence: 100 })
})
afterEach(() => jest.restoreAllMocks())

it('revalidates after a concurrent reparent commits between preflight and lock', async () => {
  const checked = deferred()
  const proceed = deferred()
  const db = database({
    afterPreflight: async () => {
      checked.resolve()
      await proceed.promise
    },
  })
  const creation = createMarketHelper(body, auth)
  const result = expect(creation).rejects.toMatchObject({ code: 400 })
  await checked.promise
  await link({ contractId: 'game', parentContractId: 'other' }, auth)
  proceed.resolve()
  await result
  expect(db.links.get('game')).toBe('other')
  expect(db.insertAttempts).toEqual([])
  expect(runTxnOutsideBetQueue).not.toHaveBeenCalled()
})

it('holds the parent lock until creation commits, rejecting a competing reparent', async () => {
  const held = deferred()
  const proceed = deferred()
  const competing = deferred()
  const db = database({
    onLockAttempt: (transaction) => {
      if (transaction === 2) competing.resolve()
    },
    afterLock: async (transaction) => {
      if (transaction === 1) {
        held.resolve()
        await proceed.promise
      }
    },
  })
  const creation = createMarketHelper(body, auth)
  await held.promise
  const reparent = link({ contractId: 'game', parentContractId: 'other' }, auth)
  const rejected = expect(reparent).rejects.toMatchObject({ code: 400 })
  await competing.promise
  proceed.resolve()
  const { contract } = await creation
  await rejected
  expect(db.links.get(contract.id)).toBe('game')
  expect(db.links.has('game')).toBe(false)
  expect(db.committedInserts).toHaveLength(1)
})

it.each([
  ['closed', { close_time: new Date(NOW).toISOString() }],
  ['resolved', { resolution: 'YES' }],
  ['unlisted', { visibility: 'unlisted' }],
  ['deleted', { deleted: true }],
])(
  'rejects a parent that becomes %s after preflight, before any writes',
  async (_name, change) => {
    const db = database({
      afterLock: async () => {
        const parent = db.parents.get('game')!
        Object.assign(parent, change)
      },
    })
    await expect(createMarketHelper(body, auth)).rejects.toMatchObject({
      code: 400,
    })
    expect(db.insertAttempts).toEqual([])
    expect(db.links.size).toBe(0)
    expect(runTxnOutsideBetQueue).not.toHaveBeenCalled()
    expect(generateAntes).not.toHaveBeenCalled()
  }
)

const databaseError = (code: string) => Object.assign(new Error(code), { code })

it('releases the real local queue while a pre-write funding retry waits', async () => {
  const { createFnQueue } = jest.requireActual<
    typeof import('shared/helpers/fn-queue')
  >('shared/helpers/fn-queue')
  const queue = createFnQueue()
  jest.mocked(betsQueue.enqueueFn).mockImplementation(queue.enqueueFn)
  jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate'] })
  jest.spyOn(Math, 'random').mockReturnValue(0)
  const db = database({
    onFundingLock: async (attempt) => {
      if (attempt === 1) throw databaseError('55P03')
    },
  })
  const creating = createMarketHelper(body, auth)
  try {
    // Flush promises until the retry timer is scheduled, without advancing it.
    for (let i = 0; i < 100 && jest.getTimerCount() === 0; i++)
      await Promise.resolve()
    expect(jest.getTimerCount()).toBe(1)
    expect(db.insertAttempts).toEqual([])
    let betRan = false
    let userWorkRan = false
    const bet = queue.enqueueFn(async () => {
      betRan = true
    }, ['bob', 'game'])
    const userWork = queue.enqueueFn(async () => {
      userWorkRan = true
    }, ['alice'])
    await Promise.resolve()
    expect(betRan).toBe(true)
    expect(userWorkRan).toBe(true)
    await Promise.all([bet, userWork])
  } finally {
    jest.runAllTimers()
    await creating
    jest.useRealTimers()
    jest.mocked(betsQueue.enqueueFn).mockImplementation(async (run) => run())
  }
  expect(db.committedInserts).toEqual([2])
  expect(db.committedAntes).toHaveLength(1)
})

it('retries payer contention before writes and commits the child, ante and link once', async () => {
  const db = database({
    onFundingLock: async (transaction) => {
      if (transaction === 1) {
        expect(db.insertAttempts).toEqual([])
        expect(runTxnOutsideBetQueue).not.toHaveBeenCalled()
        throw databaseError('55P03')
      }
    },
  })
  const { contract } = await createMarketHelper(body, auth)
  expect(db.fundingLocks).toEqual(['alice', 'alice'])
  expect(db.insertAttempts).toEqual([2])
  expect(db.committedInserts).toEqual([2])
  expect(db.committedAntes).toHaveLength(1)
  expect(runTxnOutsideBetQueue).toHaveBeenCalledTimes(1)
  expect(generateAntes).toHaveBeenCalledTimes(1)
  expect([...db.links.entries()]).toEqual([[contract.id, 'game']])
  expect(betsQueue.enqueueFn).toHaveBeenCalledWith(expect.any(Function), [
    'alice',
    'game',
  ])
})

it('bounds repeated payer contention to five attempts without writes or ante movement', async () => {
  const db = database({
    onFundingLock: async () => {
      throw databaseError('55P03')
    },
  })
  await expect(createMarketHelper(body, auth)).rejects.toMatchObject({
    code: 503,
  })
  expect(db.fundingLocks).toEqual(Array(5).fill('alice'))
  expect(db.insertAttempts).toEqual([])
  expect(db.committedInserts).toEqual([])
  expect(db.committedAntes).toEqual([])
  expect(db.links.size).toBe(0)
  expect(runTxnOutsideBetQueue).not.toHaveBeenCalled()
})

it('survives contention lasting beyond the original two attempts and charges once', async () => {
  const db = database({
    onFundingLock: async (transaction) => {
      if (transaction < 4) throw databaseError('55P03')
    },
  })
  await createMarketHelper(body, auth)
  expect(db.fundingLocks).toHaveLength(4)
  expect(db.committedInserts).toEqual([4])
  expect(db.committedAntes).toHaveLength(1)
  expect(runTxnOutsideBetQueue).toHaveBeenCalledTimes(1)
})

it.each([
  { close_time: new Date(NOW - 1).toISOString() },
  { resolution: 'YES' },
  { visibility: 'private' },
])(
  'returns the existing URL on an idempotent retry after parent eligibility changes: %p',
  async (change) => {
    const db = database()
    Object.assign(db.parents.get('game')!, change)
    jest.mocked(getContractsDirect).mockResolvedValue([
      {
        id: body.idempotencyKey,
        slug: 'existing-market',
        creatorUsername: 'alice',
      } as Contract,
    ])
    await expect(
      createMarketHelper({ ...body, closeTime: NOW - 1 }, auth)
    ).rejects.toMatchObject({
      code: 400,
      message: expect.stringContaining('/alice/existing-market'),
    })
    expect(db.fundingLocks).toEqual([])
    expect(db.insertAttempts).toEqual([])
    expect(getCloseDate).not.toHaveBeenCalled()
    expect(runTxnOutsideBetQueue).not.toHaveBeenCalled()
  }
)

it('rechecks a parent resolved while the payer contention retry was waiting', async () => {
  const db = database({
    onFundingLock: async () => {
      db.parents.get('game')!.resolution = 'YES'
      throw databaseError('55P03')
    },
  })
  await expect(createMarketHelper(body, auth)).rejects.toMatchObject({
    code: 400,
  })
  expect(db.fundingLocks).toEqual(['alice'])
  expect(db.insertAttempts).toEqual([])
  expect(runTxnOutsideBetQueue).not.toHaveBeenCalled()
})

it.each(['55P03', '40P01', '40001'])(
  'does not retry a late %s after ante side effects',
  async (code) => {
    const db = database({
      beforeCommit: async () => {
        throw databaseError(code)
      },
    })
    await expect(createMarketHelper(body, auth)).rejects.toMatchObject({ code })
    expect(db.fundingLocks).toEqual(['alice'])
    expect(db.insertAttempts).toEqual([1])
    expect(db.committedInserts).toEqual([])
    expect(db.committedAntes).toEqual([])
    expect(db.links.size).toBe(0)
    expect(runTxnOutsideBetQueue).toHaveBeenCalledTimes(1)
  }
)

it('prelocks the house payer for a free linked market', async () => {
  const db = database()
  await createMarketHelper(body, { uid: FREE_MARKET_USER_ID } as AuthedUser)
  expect(db.fundingLocks).toEqual([DEV_HOUSE_LIQUIDITY_PROVIDER_ID])
  expect(runTxnOutsideBetQueue).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ fromId: DEV_HOUSE_LIQUIDITY_PROVIDER_ID })
  )
})

it('uses the parent deadline reread under lock unless the creator supplied one', async () => {
  const revised = parentCloseTime + 60000
  // Update after the preflight snapshot, at lock acquisition.
  const changing = database({
    afterLock: async () => {
      changing.parents.get('game')!.close_time = new Date(revised).toISOString()
    },
  })
  expect((await createMarketHelper(body, auth)).contract.closeTime).toBe(
    revised
  )
  const explicit = revised + 60000
  expect(
    (await createMarketHelper({ ...body, closeTime: explicit }, auth)).contract
      .closeTime
  ).toBe(explicit)
})

it('keeps an inferred ordinary deadline when the parent has no close time', async () => {
  const db = database()
  db.parents.get('game')!.close_time = null
  expect((await createMarketHelper(body, auth)).contract.closeTime).toBe(
    fallbackCloseTime
  )
  expect(getCloseDate).toHaveBeenCalledTimes(1)
})

describe.each(['STONK', 'BOUNTIED_QUESTION'] as const)(
  '%s native close-time behavior',
  (outcomeType) => {
    const request = () =>
      createMarketProps.parse({
        ...body,
        outcomeType,
        totalBounty: MINIMUM_BOUNTY,
      })

    it('keeps no close time when created without a parent', async () => {
      database()
      const { contract } = await createMarketHelper(
        { ...request(), linkedToContractId: undefined },
        auth
      )
      expect(contract.closeTime).toBeUndefined()
      expect(getCloseDate).not.toHaveBeenCalled()
    })

    it('does not inherit either the preflight or locked parent deadline', async () => {
      const db = database({
        afterLock: async () => {
          db.parents.get('game')!.close_time = new Date(
            parentCloseTime + 60_000
          ).toISOString()
        },
      })
      const { contract } = await createMarketHelper(request(), auth)
      expect(contract.closeTime).toBeUndefined()
      expect(getCloseDate).not.toHaveBeenCalled()
      expect(db.links.get(contract.id)).toBe('game')
      expect(db.committedInserts).toHaveLength(1)
      expect(db.committedAntes).toEqual([
        outcomeType === 'BOUNTIED_QUESTION' ? MINIMUM_BOUNTY : 100,
      ])
    })

    it('preserves an explicitly supplied deadline', async () => {
      database()
      const explicitCloseTime = parentCloseTime + 120_000
      const { contract } = await createMarketHelper(
        { ...request(), closeTime: explicitCloseTime },
        auth
      )
      expect(contract.closeTime).toBe(explicitCloseTime)
      expect(getCloseDate).not.toHaveBeenCalled()
    })
  }
)

it('does not keep a stale inherited poll deadline when the parent removes it', async () => {
  const db = database({
    afterLock: async () => {
      db.parents.get('game')!.close_time = null
    },
  })
  const { contract } = await createMarketHelper(
    {
      ...body,
      outcomeType: 'POLL',
      answers: ['Yes', 'No'],
    },
    auth
  )
  expect(contract.closeTime).toBeUndefined()
})

it('rejects the effective unlisted child before inserts or ante movement', async () => {
  const db = database()
  db.setUserName('Rima Akter')
  await expect(createMarketHelper(body, auth)).rejects.toMatchObject({
    code: 400,
  })
  expect(db.insertAttempts).toEqual([])
  expect(runTxnOutsideBetQueue).not.toHaveBeenCalled()
  expect(generateAntes).not.toHaveBeenCalled()
})

it.each([undefined, false, true])(
  'supports explicit poll Never without changing omitted/false defaults (%s)',
  async (neverCloses) => {
    database()
    const { contract } = await createMarketHelper(
      {
        ...body,
        outcomeType: 'POLL',
        answers: ['Yes', 'No'],
        neverCloses,
      },
      auth
    )
    expect(contract.closeTime).toBe(neverCloses ? undefined : parentCloseTime)
  }
)

it.each([
  { ...body, neverCloses: true },
  {
    ...body,
    outcomeType: 'POLL' as const,
    answers: ['Yes', 'No'],
    neverCloses: true,
    closeTime: parentCloseTime,
  },
])(
  'rejects invalid Never requests even for direct helper callers',
  async (request) => {
    const db = database()
    await expect(createMarketHelper(request, auth)).rejects.toMatchObject({
      code: 400,
    })
    expect(db.insertAttempts).toEqual([])
    expect(runTxnOutsideBetQueue).not.toHaveBeenCalled()
  }
)
