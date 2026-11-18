// The sharing quest's payout, against the real bets queue and an in-memory
// stand-in for the user row lock, the share count and the txns table.
jest.mock('shared/utils', () => ({
  log: Object.assign(jest.fn(), { error: jest.fn() }),
  getUser: jest.fn(),
}))
// A fresh real queue per test (see beforeEach), so a deadlocked item can't
// block later tests.
jest.mock('shared/helpers/fn-queue', () => ({
  betsQueue: { enqueueFn: jest.fn() },
}))
jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(),
  createSupabaseClient: jest.fn(() => ({})),
}))
jest.mock('common/supabase/set-scores', () => ({
  setQuestScoreValue: jest.fn(),
  getQuestScore: jest.fn(),
}))
jest.mock('common/supabase/contracts', () => ({
  getRecentContractIds: jest.fn(),
}))
jest.mock('shared/supabase/entitlements', () => ({
  getActiveSupporterEntitlements: jest.fn(async () => []),
}))
jest.mock('shared/create-notification', () => ({
  createQuestPayoutNotification: jest.fn(),
}))
jest.mock('shared/txn/run-txn', () => ({
  runTxnOutsideBetQueue: jest.fn(),
  // The old payout path: queues the txn behind the user's other queue work.
  runTxnFromBank: jest.fn(),
}))

import { User } from 'common/user'
import { getRecentContractIds } from 'common/supabase/contracts'
import { getQuestScore, setQuestScoreValue } from 'common/supabase/set-scores'
import { recordContractInteraction } from 'api/record-contract-interaction'
import { AuthedUser } from 'api/helpers/endpoint'
import {
  completeCalculatedQuestFromTrigger,
  completeSharingQuest,
} from 'shared/complete-quest-internal'
import { createQuestPayoutNotification } from 'shared/create-notification'
import { betsQueue } from 'shared/helpers/fn-queue'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { runTxnFromBank, runTxnOutsideBetQueue } from 'shared/txn/run-txn'
import { getUser, log } from 'shared/utils'

const { createFnQueue } = jest.requireActual<
  typeof import('shared/helpers/fn-queue')
>('shared/helpers/fn-queue')

const USER = {
  id: 'sharer',
  name: 'Sharer',
  username: 'sharer',
  bonusEligibility: 'verified',
} as unknown as User

type Paid = { questType: string; createdTime: number; amount: number }
type PendingTxn = { questType: string; amount: number }
type FakeTx = {
  oneOrNone: (sql: string, params: unknown[]) => Promise<unknown>
  pending: PendingTxn[]
}

let shares: number
let scores: Map<string, number>
let paid: Paid[]
let events: string[]
let lockOwner: string | null
let lockWaiters: (() => void)[]
let failNextPayout: boolean
let txCount: number

const acquireRowLock = async (owner: string) => {
  while (lockOwner !== null && lockOwner !== owner)
    await new Promise<void>((resolve) => lockWaiters.push(resolve))
  lockOwner = owner
}
const releaseRowLock = (owner: string) => {
  if (lockOwner !== owner) return
  lockOwner = null
  lockWaiters.splice(0).forEach((resolve) => resolve())
}

// Every reward the old code paid had questCount 1 (it paid only at count 1).
const paidSince = (
  questType: unknown,
  periodStart: unknown,
  questCount?: unknown
) =>
  paid.some(
    (p) =>
      p.questType === questType &&
      p.createdTime >= Number(periodStart) &&
      (questCount === undefined || Number(questCount) === 1)
  )

const query =
  (owner: string | undefined) => async (sql: string, params: unknown[]) => {
    if (sql.includes('for update')) {
      if (!owner) throw new Error('row lock taken outside a transaction')
      await acquireRowLock(owner)
      events.push(`${owner} locked user`)
      return { '?column?': 1 }
    }
    if (sql.includes('from txns')) {
      // The old check also matched questCount ($3) before the start ($4).
      const found = sql.includes('questCount')
        ? paidSince(params[1], params[3], params[2])
        : paidSince(params[1], params[2])
      return found ? { '?column?': 1 } : null
    }
    throw new Error(`unexpected query: ${sql}`)
  }

const fakePg = {
  one: async (sql: string) => {
    if (sql.includes('user_contract_interactions')) return { count: shares }
    throw new Error(`unexpected query: ${sql}`)
  },
  none: async (sql: string) => {
    if (sql.includes('insert into user_contract_interactions')) shares++
    else throw new Error(`unexpected query: ${sql}`)
  },
  oneOrNone: query(undefined),
  tx: async <T>(fn: (tx: FakeTx) => Promise<T>) => {
    const owner = `tx${++txCount}`
    const tx: FakeTx = { oneOrNone: query(owner), pending: [] }
    try {
      const result = await fn(tx)
      // Commit.
      for (const t of tx.pending) paid.push({ ...t, createdTime: Date.now() })
      return result
    } finally {
      releaseRowLock(owner)
    }
  },
}

let txnIds = 0
const payout = async (
  tx: FakeTx,
  data: { amount: number; data: { questType: string } }
) => {
  if (failNextPayout) {
    failNextPayout = false
    throw new Error('payout failed')
  }
  // As runTxn does.
  if (!(data.amount > 0)) throw new Error('Amount must be positive')
  tx.pending.push({ questType: data.data.questType, amount: data.amount })
  return { id: `txn${++txnIds}`, ...data }
}

// Fails the test instead of hanging when a payout deadlocks.
const within = async <T>(ms: number, promise: Promise<T>) => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`still waiting after ${ms}ms`)),
          ms
        )
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

beforeEach(() => {
  shares = 0
  scores = new Map()
  paid = []
  events = []
  lockOwner = null
  lockWaiters = []
  failNextPayout = false
  txCount = 0
  jest.clearAllMocks()
  jest
    .mocked(betsQueue.enqueueFn)
    .mockImplementation(createFnQueue({ name: 'Bets' }).enqueueFn)
  jest.mocked(setQuestScoreValue).mockImplementation((async (
    _userId: string,
    scoreId: string,
    value: number
  ) => {
    scores.set(scoreId, value)
  }) as never)
  jest.mocked(getQuestScore).mockImplementation(async (_userId, questType) => ({
    score:
      scores.get(
        questType === 'SHARES' ? 'sharesToday' : 'marketsCreatedThisWeek'
      ) ?? 0,
    idempotencyKey: undefined,
  }))
  jest.mocked(createSupabaseDirectClient).mockReturnValue(fakePg as never)
  jest.mocked(runTxnOutsideBetQueue).mockImplementation(payout as never)
  jest
    .mocked(runTxnFromBank)
    .mockImplementation(((tx: FakeTx, data: { toId: string }) =>
      betsQueue.enqueueFn(
        () => payout(tx, data as never),
        [data.toId]
      )) as never)
  jest.mocked(createQuestPayoutNotification).mockResolvedValue(undefined)
  jest.mocked(getUser).mockResolvedValue(USER)
})

describe('completeSharingQuest', () => {
  it('pays once the count reaches the target and records the count', async () => {
    shares = 1
    const result = await completeSharingQuest(USER)
    expect(paid).toEqual([
      expect.objectContaining({ questType: 'SHARES', amount: 5 }),
    ])
    expect(result).toEqual(expect.objectContaining({ bonusAmount: 5 }))
    expect(scores.get('sharesToday')).toBe(1)
    expect(createQuestPayoutNotification).toHaveBeenCalledTimes(1)
  })

  it('pays nothing before the first share', async () => {
    await completeSharingQuest(USER)
    expect(paid).toEqual([])
    expect(scores.get('sharesToday')).toBe(0)
  })

  it('pays when the first call already counts two shares (double tap, or the first call was lost)', async () => {
    shares = 2
    await completeSharingQuest(USER)
    expect(paid).toHaveLength(1)
  })

  it('pays exactly once when several calls for a double tap run at once', async () => {
    shares = 2
    await Promise.all([
      completeSharingQuest(USER),
      completeSharingQuest(USER),
      completeSharingQuest(USER),
    ])
    expect(paid).toHaveLength(1)
    expect(createQuestPayoutNotification).toHaveBeenCalledTimes(1)
  })

  it('pays on the next share after a payout fails', async () => {
    shares = 1
    failNextPayout = true
    await expect(completeSharingQuest(USER)).rejects.toThrow('payout failed')
    expect(paid).toEqual([])
    // The count already shows the quest as done; the next share still pays.
    shares = 2
    await completeSharingQuest(USER)
    expect(paid).toHaveLength(1)
  })

  it('pays only once a day and skips the queue once paid', async () => {
    shares = 1
    await completeSharingQuest(USER)
    jest.mocked(betsQueue.enqueueFn).mockClear()
    shares = 5
    await completeSharingQuest(USER)
    expect(paid).toHaveLength(1)
    expect(betsQueue.enqueueFn).not.toHaveBeenCalled()
  })

  it("doesn't count a reward paid before today", async () => {
    paid.push({
      questType: 'SHARES',
      createdTime: Date.now() - 2 * 24 * 60 * 60 * 1000,
      amount: 5,
    })
    shares = 1
    await completeSharingQuest(USER)
    expect(paid).toHaveLength(2)
  })

  it("doesn't count other quests' rewards", async () => {
    paid.push({
      questType: 'MARKETS_CREATED',
      createdTime: Date.now(),
      amount: 100,
    })
    shares = 1
    await completeSharingQuest(USER)
    expect(paid.filter((p) => p.questType === 'SHARES')).toHaveLength(1)
  })

  it('pays nothing, without failing, when the tier multiplier is zero', async () => {
    shares = 1
    const flagged = {
      ...USER,
      bonusEligibility: 'requires_verification',
    } as User
    await expect(completeSharingQuest(flagged)).resolves.toEqual({ count: 1 })
    expect(paid).toEqual([])
    expect(createQuestPayoutNotification).not.toHaveBeenCalled()
  })

  it('keeps the payout when the notification fails', async () => {
    shares = 1
    jest
      .mocked(createQuestPayoutNotification)
      .mockRejectedValueOnce(new Error('notifications down'))
    await expect(completeSharingQuest(USER)).resolves.toEqual(
      expect.objectContaining({ bonusAmount: 5 })
    )
    expect(paid).toHaveLength(1)
    expect(log.error).toHaveBeenCalled()
  })

  // Prod, 2026-11-14 09:45Z: the user's own API bet held their queue slot and
  // needed their user row; the payout held the row and waited for the slot.
  // Neither moved until the queue expired the payout 10s later (503).
  it("pays while the user's bet holds their queue slot and waits for their row", async () => {
    shares = 1
    let betStarted!: () => void
    const started = new Promise<void>((resolve) => (betStarted = resolve))
    const bet = betsQueue.enqueueFn(async () => {
      betStarted()
      // Still fetching bet data when the share comes in.
      await new Promise((resolve) => setTimeout(resolve, 50))
      await acquireRowLock('bet')
      events.push('bet locked user')
      releaseRowLock('bet')
    }, [USER.id, 'contract'])
    await started
    await within(2000, Promise.all([bet, completeSharingQuest(USER)]))
    expect(paid).toHaveLength(1)
    expect(events).toEqual(['bet locked user', 'tx1 locked user'])
  })
})

describe('recordContractInteraction', () => {
  const auth = { uid: USER.id, creds: { kind: 'jwt' } } as unknown as AuthedUser
  const record = (kind: 'page share' | 'page like') =>
    recordContractInteraction(
      { contractId: 'c1', kind } as never,
      auth,
      {} as never
    )

  it('pays the sharing quest from the request that records the share', async () => {
    await expect(record('page share')).resolves.toEqual({ status: 'success' })
    expect(shares).toBe(1)
    expect(paid).toHaveLength(1)
  })

  it('pays once across the share request and the follow-up /completequest call', async () => {
    await Promise.all([record('page share'), completeSharingQuest(USER)])
    await completeSharingQuest(USER)
    expect(paid).toHaveLength(1)
  })

  it('records the share even when the payout fails', async () => {
    failNextPayout = true
    await expect(record('page share')).resolves.toEqual({ status: 'success' })
    expect(shares).toBe(1)
    expect(paid).toEqual([])
    expect(log.error).toHaveBeenCalled()
  })

  it("doesn't touch quests for other interactions", async () => {
    await record('page like')
    expect(getUser).not.toHaveBeenCalled()
    expect(paid).toEqual([])
  })
})

describe('completeCalculatedQuestFromTrigger (MARKETS_CREATED, unchanged)', () => {
  it('pays when the weekly count reaches 1 and not again at 2', async () => {
    jest.mocked(getRecentContractIds).mockResolvedValueOnce(['c1'])
    await completeCalculatedQuestFromTrigger(
      USER,
      'MARKETS_CREATED',
      'k1',
      'c1'
    )
    expect(paid).toEqual([
      expect.objectContaining({ questType: 'MARKETS_CREATED', amount: 100 }),
    ])

    jest.mocked(getRecentContractIds).mockResolvedValueOnce(['c1', 'c2'])
    await completeCalculatedQuestFromTrigger(
      USER,
      'MARKETS_CREATED',
      'k2',
      'c2'
    )
    expect(paid).toHaveLength(1)
  })
})
