// Quest payouts (daily sharing, weekly question creation), against the real
// bets queue and an in-memory stand-in for the user row lock, the share and
// question counts and the txns table.
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
}))
jest.mock('shared/supabase/entitlements', () => ({
  getActiveSupporterEntitlements: jest.fn(async () => []),
}))
jest.mock('shared/create-notification', () => ({
  createQuestPayoutNotification: jest.fn(),
}))
jest.mock('shared/txn/run-txn', () => ({
  runTxnOutsideBetQueue: jest.fn(),
}))

import { uniq } from 'lodash'
import { User } from 'common/user'
import { getQuestWeekStart } from 'common/quest'
import { setQuestScoreValue } from 'common/supabase/set-scores'
import { DAY_MS } from 'common/util/time'
import { recordContractInteraction } from 'api/record-contract-interaction'
import { AuthedUser } from 'api/helpers/endpoint'
import {
  completeMarketCreationQuests,
  completeSharingQuest,
} from 'shared/complete-quest-internal'
import { createQuestPayoutNotification } from 'shared/create-notification'
import { betsQueue } from 'shared/helpers/fn-queue'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { runTxnOutsideBetQueue } from 'shared/txn/run-txn'
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

type PendingTxn = {
  questType: string
  questCount: number
  periodStart?: number
  amount: number
}
type Paid = PendingTxn & { createdTime: number }
type FakeTx = {
  oneOrNone: (sql: string, params: unknown[]) => Promise<unknown>
  map: typeof mapPaidQuestTypes
  pending: PendingTxn[]
}

let shareTimes: number[]
// The user's other questions in the week of the question being counted.
let otherQuestionsThisWeek: number
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

// As PAID_FOR_PERIOD_SQL: a reward that records this periodStart, or one
// paid within the period before rewards recorded a periodStart.
const mapPaidQuestTypes = async <T>(
  sql: string,
  params: { periodStart: number; periodEnd: number },
  fn: (row: { quest_type: string }) => T
) => {
  if (!sql.includes('from txns')) throw new Error(`unexpected query: ${sql}`)
  const { periodStart, periodEnd } = params
  const types = uniq(
    paid
      .filter(
        (p) =>
          p.createdTime >= periodStart &&
          (p.periodStart === periodStart ||
            (p.periodStart === undefined && p.createdTime < periodEnd))
      )
      .map((p) => p.questType)
  )
  return types.map((quest_type) => fn({ quest_type }))
}

const query = (owner: string | undefined) => async (sql: string) => {
  if (sql.includes('for update') || sql.includes('for no key update')) {
    if (!owner) throw new Error('row lock taken outside a transaction')
    await acquireRowLock(owner)
    events.push(`${owner} locked user`)
    return { '?column?': 1 }
  }
  throw new Error(`unexpected query: ${sql}`)
}

const setShares = (n: number) => {
  shareTimes = Array.from({ length: n }, () => Date.now())
}

const fakePg = {
  one: async (sql: string, params: unknown[]) => {
    if (sql.includes('user_contract_interactions')) {
      // [start, end), as the real query.
      const [, startTs, endTs] = params as [string, string, string?]
      const start = Date.parse(startTs)
      // Older code's query had no end bound.
      const end = endTs === undefined ? Infinity : Date.parse(endTs)
      return {
        count: shareTimes.filter((t) => t >= start && t < end).length,
      }
    }
    if (sql.includes('from contracts'))
      return { count: otherQuestionsThisWeek + 1 }
    throw new Error(`unexpected query: ${sql}`)
  },
  none: async (sql: string) => {
    if (sql.includes('insert into user_contract_interactions'))
      shareTimes.push(Date.now())
    else throw new Error(`unexpected query: ${sql}`)
  },
  oneOrNone: query(undefined),
  map: mapPaidQuestTypes,
  tx: async <T>(fn: (tx: FakeTx) => Promise<T>) => {
    const owner = `tx${++txCount}`
    const txStart = Date.now()
    const tx: FakeTx = {
      oneOrNone: query(owner),
      map: mapPaidQuestTypes,
      pending: [],
    }
    try {
      const result = await fn(tx)
      // Commit.
      for (const t of tx.pending) paid.push({ ...t, createdTime: txStart })
      return result
    } finally {
      releaseRowLock(owner)
    }
  },
}

let txnIds = 0
const payout = async (
  tx: FakeTx,
  data: {
    amount: number
    data: { questType: string; questCount: number; periodStart?: number }
  }
) => {
  if (failNextPayout) {
    failNextPayout = false
    throw new Error('payout failed')
  }
  // As runTxn does.
  if (!(data.amount > 0)) throw new Error('Amount must be positive')
  tx.pending.push({
    questType: data.data.questType,
    questCount: data.data.questCount,
    periodStart: data.data.periodStart,
    amount: data.amount,
  })
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
  shareTimes = []
  otherQuestionsThisWeek = 0
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
  jest.mocked(createSupabaseDirectClient).mockReturnValue(fakePg as never)
  jest.mocked(runTxnOutsideBetQueue).mockImplementation(payout as never)
  jest.mocked(createQuestPayoutNotification).mockResolvedValue(undefined)
  jest.mocked(getUser).mockResolvedValue(USER)
})

describe('completeSharingQuest', () => {
  it('pays once the count reaches the target and records the count', async () => {
    setShares(1)
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
    setShares(2)
    await completeSharingQuest(USER)
    expect(paid).toHaveLength(1)
  })

  it('pays exactly once when several calls for a double tap run at once', async () => {
    setShares(2)
    await Promise.all([
      completeSharingQuest(USER),
      completeSharingQuest(USER),
      completeSharingQuest(USER),
    ])
    expect(paid).toHaveLength(1)
    expect(createQuestPayoutNotification).toHaveBeenCalledTimes(1)
  })

  it('pays on the next share after a payout fails', async () => {
    setShares(1)
    failNextPayout = true
    await expect(completeSharingQuest(USER)).rejects.toThrow('payout failed')
    expect(paid).toEqual([])
    // The count already shows the quest as done; the next share still pays.
    setShares(2)
    await completeSharingQuest(USER)
    expect(paid).toHaveLength(1)
  })

  it("pays only once a day and doesn't lock the user once paid", async () => {
    setShares(1)
    await completeSharingQuest(USER)
    expect(txCount).toBe(1)
    setShares(5)
    await completeSharingQuest(USER)
    expect(paid).toHaveLength(1)
    expect(txCount).toBe(1)
  })

  it("doesn't count a reward paid before today", async () => {
    paid.push({
      questType: 'SHARES',
      questCount: 1,
      createdTime: Date.now() - 2 * 24 * 60 * 60 * 1000,
      amount: 5,
    })
    setShares(1)
    await completeSharingQuest(USER)
    expect(paid).toHaveLength(2)
  })

  it("doesn't count other quests' rewards", async () => {
    paid.push({
      questType: 'MARKETS_CREATED',
      questCount: 1,
      createdTime: Date.now(),
      amount: 100,
    })
    setShares(1)
    await completeSharingQuest(USER)
    expect(paid.filter((p) => p.questType === 'SHARES')).toHaveLength(1)
  })

  it("doesn't count yesterday's reward paid just after midnight", async () => {
    paid.push({
      questType: 'SHARES',
      questCount: 1,
      periodStart: Date.now() - 1.5 * DAY_MS,
      createdTime: Date.now(),
      amount: 5,
    })
    setShares(1)
    await completeSharingQuest(USER)
    expect(paid).toHaveLength(2)
  })

  // Only Date is faked: the queue, locks and test timeouts keep real timers.
  const atTime = async (iso: string, fn: () => Promise<void>) => {
    jest.useFakeTimers({
      now: Date.parse(iso),
      doNotFake: [
        'nextTick',
        'setImmediate',
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'queueMicrotask',
      ],
    })
    try {
      await fn()
    } finally {
      jest.useRealTimers()
    }
  }

  it("doesn't pay yesterday's quest with a share made after midnight", async () => {
    // 17 Nov 23:59:59.900 PST takes 17 Nov's period; the share lands on 18 Nov.
    await atTime('2026-11-18T07:59:59.900Z', async () => {
      shareTimes = [Date.parse('2026-11-18T08:00:00.200Z')]
      await completeSharingQuest(USER)
      expect(paid).toEqual([])
      jest.setSystemTime(Date.parse('2026-11-18T08:00:01.000Z'))
      await completeSharingQuest(USER)
    })
    expect(paid).toEqual([
      expect.objectContaining({
        questType: 'SHARES',
        periodStart: Date.parse('2026-11-18T08:00:00.000Z'),
      }),
    ])
  })

  // 1 Nov 2026 is 25 hours long in Los Angeles: 07:00Z to 2 Nov 08:00Z.
  it('counts a reward without periodStart paid in the 25th hour of the fall-back day', async () => {
    await atTime('2026-11-02T07:45:00.000Z', async () => {
      paid.push({
        questType: 'SHARES',
        questCount: 1,
        createdTime: Date.parse('2026-11-02T07:30:00.000Z'),
        amount: 5,
      })
      setShares(1)
      await completeSharingQuest(USER)
    })
    expect(paid).toHaveLength(1)
  })

  // Rewards paid before rewards recorded periodStart, e.g. by API instances
  // still on older code during a deploy.
  it('counts a reward paid today without a periodStart', async () => {
    paid.push({
      questType: 'SHARES',
      questCount: 1,
      createdTime: Date.now(),
      amount: 5,
    })
    setShares(1)
    await completeSharingQuest(USER)
    expect(paid).toHaveLength(1)
  })

  it('pays nothing, without failing, when the tier multiplier is zero', async () => {
    setShares(1)
    const flagged = {
      ...USER,
      bonusEligibility: 'requires_verification',
    } as User
    await expect(completeSharingQuest(flagged)).resolves.toEqual({ count: 1 })
    expect(paid).toEqual([])
    expect(createQuestPayoutNotification).not.toHaveBeenCalled()
  })

  it('keeps the payout when the notification fails', async () => {
    setShares(1)
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
    setShares(1)
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
    // The payout didn't wait for the bet's queue slot.
    expect(events).toEqual(['tx1 locked user', 'bet locked user'])
    expect(betsQueue.enqueueFn).toHaveBeenCalledTimes(1)
  })

  // Cash conversion and in-app purchases hold the user row between two queued
  // txns. A payout that took the queue slot and then waited for the row would
  // leave their second txn waiting for the slot until the queue failed it.
  it('lets a payment holding the row between two queued txns finish first', async () => {
    setShares(1)
    let firstDone!: () => void
    const betweenTxns = new Promise<void>((resolve) => (firstDone = resolve))
    const conversion = (async () => {
      await betsQueue.enqueueFn(() => acquireRowLock('conversion'), [USER.id])
      firstDone()
      await new Promise((resolve) => setTimeout(resolve, 50))
      await betsQueue.enqueueFn(async () => {
        events.push('conversion second txn')
      }, [USER.id])
      releaseRowLock('conversion')
    })()
    await betweenTxns
    await within(3000, Promise.all([conversion, completeSharingQuest(USER)]))
    expect(paid).toHaveLength(1)
    expect(events[0]).toBe('conversion second txn')
  })

  it('waits for a row held by a long payment, then pays, without holding the queue', async () => {
    setShares(1)
    await acquireRowLock('long payment')
    setTimeout(() => releaseRowLock('long payment'), 2000)
    const quest = completeSharingQuest(USER)
    // The user's other queued work isn't held up meanwhile.
    await within(
      500,
      betsQueue.enqueueFn(async () => undefined, [USER.id])
    )
    await within(5000, quest)
    expect(paid).toHaveLength(1)
  })

  // During a deploy, instances still on the old code treat only a reward with
  // questCount 1 as already paid.
  it('records questCount 1 when paid at a later count, so old instances see it', async () => {
    setShares(3)
    await completeSharingQuest(USER)
    expect(paid).toEqual([expect.objectContaining({ questCount: 1 })])
    expect(createQuestPayoutNotification).toHaveBeenCalledWith(
      USER,
      expect.any(String),
      5,
      1,
      'SHARES'
    )
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
    expect(shareTimes).toHaveLength(1)
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
    expect(shareTimes).toHaveLength(1)
    expect(paid).toEqual([])
    expect(log.error).toHaveBeenCalled()
  })

  it("doesn't touch quests for other interactions", async () => {
    await record('page like')
    expect(getUser).not.toHaveBeenCalled()
    expect(paid).toEqual([])
  })
})

describe('completeMarketCreationQuests', () => {
  const question = (createdTime = Date.now()) => ({ id: 'q1', createdTime })
  const thisWeek = () => getQuestWeekStart()

  it('pays the first question of the week once, for this week', async () => {
    await completeMarketCreationQuests(USER, question())
    expect(paid).toEqual([
      expect.objectContaining({
        questType: 'MARKETS_CREATED',
        questCount: 1,
        periodStart: thisWeek(),
        amount: 100,
      }),
    ])
    expect(scores.get('marketsCreatedThisWeek')).toBe(1)
    otherQuestionsThisWeek = 1
    await completeMarketCreationQuests(USER, question())
    expect(paid).toHaveLength(1)
    expect(scores.get('marketsCreatedThisWeek')).toBe(2)
  })

  it('pays the three-question quest at the third question', async () => {
    await completeMarketCreationQuests(USER, question())
    otherQuestionsThisWeek = 2
    await completeMarketCreationQuests(USER, question())
    expect(paid.map((p) => [p.questType, p.questCount])).toEqual([
      ['MARKETS_CREATED', 1],
      ['MARKETS_CREATED_3', 3],
    ])
  })

  it('pays both quests when the first count it sees is already 3', async () => {
    otherQuestionsThisWeek = 2
    await completeMarketCreationQuests(USER, question())
    expect(paid.map((p) => p.questType).sort()).toEqual([
      'MARKETS_CREATED',
      'MARKETS_CREATED_3',
    ])
  })

  it('pays each quest once when questions are created at once', async () => {
    otherQuestionsThisWeek = 2
    await Promise.all([
      completeMarketCreationQuests(USER, question()),
      completeMarketCreationQuests(USER, question()),
    ])
    expect(paid).toHaveLength(2)
  })

  it("doesn't count last week's reward paid just past Monday midnight", async () => {
    paid.push({
      questType: 'MARKETS_CREATED',
      questCount: 1,
      periodStart: getQuestWeekStart(new Date(Date.now() - 7 * DAY_MS)),
      createdTime: Date.now(),
      amount: 100,
    })
    await completeMarketCreationQuests(USER, question())
    expect(paid).toHaveLength(2)
  })

  it('counts a reward paid this week without a periodStart', async () => {
    paid.push({
      questType: 'MARKETS_CREATED',
      questCount: 1,
      createdTime: Date.now(),
      amount: 100,
    })
    await completeMarketCreationQuests(USER, question())
    expect(paid).toHaveLength(1)
  })

  it('counts a late trigger toward the week the question was created', async () => {
    const lastWeek = Date.now() - 7 * DAY_MS
    await completeMarketCreationQuests(USER, question(lastWeek))
    expect(paid).toEqual([
      expect.objectContaining({
        questType: 'MARKETS_CREATED',
        periodStart: getQuestWeekStart(new Date(lastWeek)),
      }),
    ])
    // The quests modal shows this week's progress only.
    expect(scores.has('marketsCreatedThisWeek')).toBe(false)
  })

  it('pays nothing, without failing, when the tier multiplier is zero', async () => {
    const flagged = {
      ...USER,
      bonusEligibility: 'requires_verification',
    } as User
    await expect(
      completeMarketCreationQuests(flagged, question())
    ).resolves.toEqual({ count: 1 })
    expect(paid).toEqual([])
  })

  // The old blocking lock waited for a busy row; the payout still does.
  it('pays the first question of the week while the user row is busy for a while', async () => {
    // Its own owner name, so a release timer left by an earlier test can't free it.
    await acquireRowLock('long market payment')
    setTimeout(() => releaseRowLock('long market payment'), 2000)
    await within(5000, completeMarketCreationQuests(USER, question()))
    expect(paid).toEqual([
      expect.objectContaining({ questType: 'MARKETS_CREATED', amount: 100 }),
    ])
  })
})
