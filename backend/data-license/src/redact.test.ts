import { Pseudonymizer } from './pseudonymize'
import {
  REDACTORS,
  RedactContext,
  Row,
  cancelTimeReliable,
  newStats,
} from './redact'
import { scanBatch } from './validate'

const ps = new Pseudonymizer(Buffer.from('fixture-salt'), 'User_', 20)
const USER = 'userUUUUUUUUUUUUUUUUUUUUUUU1'

function makeCtx(over: Partial<RedactContext> = {}): RedactContext {
  return {
    ps,
    stats: newStats(),
    deletedUserIds: new Set(),
    deletedAccountMode: 'redact',
    knownUserIds: new Set([USER]),
    scopedContractIds: new Set(['c1']),
    bareUsernames: true,
    blankModeratedComments: false,
    scrubDescriptions: false,
    ...over,
  }
}

const doc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

const ms = (iso: string) => Date.parse(iso)

function bet(over: {
  created: string
  updated: string
  fills?: string[]
  cancelled?: boolean
}) {
  return {
    bet_id: 'b1',
    contract_id: 'c1',
    user_id: USER,
    is_cancelled: over.cancelled ?? true,
    created_time: new Date(over.created),
    updated_time: new Date(over.updated),
    data: {
      id: 'b1',
      userId: USER,
      limitProb: 0.4,
      isCancelled: over.cancelled ?? true,
      fills: (over.fills ?? []).map((t) => ({ timestamp: ms(t), amount: 1 })),
    },
  }
}

describe('cancel_time_reliable', () => {
  test('null for rows that are not cancelled orders', () => {
    expect(
      cancelTimeReliable(
        bet({
          created: '2024-08-01T00:00:00Z',
          updated: '2024-08-01T00:00:00Z',
          cancelled: false,
        })
      )
    ).toBeNull()
  })

  test('true when updated_time was stamped by the cancel', () => {
    expect(
      cancelTimeReliable(
        bet({
          created: '2023-03-01T00:00:00Z',
          updated: '2023-03-02T10:00:00Z',
        })
      )
    ).toBe(true)
    // after the trigger fix even a fast cancel is a real stamp
    expect(
      cancelTimeReliable(
        bet({
          created: '2025-03-01T00:00:00Z',
          updated: '2025-03-01T00:00:00.200Z',
        })
      )
    ).toBe(true)
  })

  test('false when cancelled while the trigger was broken', () => {
    const stats = newStats()
    expect(
      cancelTimeReliable(
        bet({
          created: '2024-08-01T00:00:00Z',
          updated: '2024-08-01T00:00:00.300Z',
        }),
        stats
      )
    ).toBe(false)
    // placed before the window: may have been cancelled during it
    expect(
      cancelTimeReliable(
        bet({
          created: '2024-01-01T00:00:00Z',
          updated: '2024-01-01T00:00:00.100Z',
        }),
        stats
      )
    ).toBe(false)
    // placed in the window, cancelled after the fix: a real stamp
    expect(
      cancelTimeReliable(
        bet({
          created: '2024-08-01T00:00:00Z',
          updated: '2025-02-01T00:00:00Z',
        }),
        stats
      )
    ).toBe(true)
    expect(stats).toMatchObject({
      cancelledOrders: 3,
      cancelTimeUnreliable: 2,
      cancelTimeUnreliableWindow: 2,
      cancelTimeUnreliablePreWindow: 1,
      cancelTimeUnreliableFillAfter: 0,
    })
  })

  test('false when a fill lands after updated_time', () => {
    const stats = newStats()
    expect(
      cancelTimeReliable(
        bet({
          created: '2023-01-01T00:00:00Z',
          updated: '2023-01-02T00:00:00Z',
          fills: ['2023-01-01T12:00:00Z', '2023-01-05T00:00:00Z'],
        }),
        stats
      )
    ).toBe(false)
    expect(stats.cancelTimeUnreliableFillAfter).toBe(1)
    // fills before the cancel, or within the clock slack, are fine
    expect(
      cancelTimeReliable(
        bet({
          created: '2023-01-01T00:00:00Z',
          updated: '2023-01-02T00:00:00Z',
          fills: ['2023-01-01T12:00:00Z', '2023-01-02T00:00:00.500Z'],
        })
      )
    ).toBe(true)
  })

  test('falls back to data.isCancelled; delivered as a column', () => {
    const row = bet({
      created: '2024-08-01T00:00:00Z',
      updated: '2024-08-01T00:00:00Z',
    }) as Row
    delete row.is_cancelled
    const out = REDACTORS.contract_bets(row, makeCtx()) as Row
    expect(out.cancel_time_reliable).toBe(false)
    expect(out.user_id).toBe(ps.map(USER))
  })
})

describe('comment text scrub', () => {
  test('phones go, dates and probabilities stay', () => {
    const out = REDACTORS.contract_comments(
      {
        comment_id: 'm1',
        contract_id: 'c1',
        user_id: USER,
        data: {
          id: 'm1',
          userId: USER,
          content: doc(
            'Text 201-555-0123 or a@b.co; resolves 2025-01-31 at 0.35, 0.40'
          ),
        },
      },
      makeCtx()
    ) as Row
    expect(out.data.content.content[0].content[0].text).toBe(
      'Text [phone removed] or [email removed]; resolves 2025-01-31 at 0.35, 0.40'
    )
  })
})

describe('moderated comments (BLANK_MODERATED_COMMENTS)', () => {
  const moderated = (flag: 'deleted' | 'hidden') => ({
    comment_id: 'm1',
    contract_id: 'c1',
    user_id: USER,
    data: {
      id: 'm1',
      userId: USER,
      [flag]: true,
      content: doc('original text'),
      text: 'x',
    },
  })

  test('off: text ships with its flags', () => {
    const out = REDACTORS.contract_comments(
      moderated('deleted'),
      makeCtx()
    ) as Row
    expect(out.data.content.content[0].content[0].text).toBe('original text')
  })

  test.each(['deleted', 'hidden'] as const)(
    'on: %s comment blanked, row and flag kept',
    (flag) => {
      const ctx = makeCtx({ blankModeratedComments: true })
      const out = REDACTORS.contract_comments(moderated(flag), ctx) as Row
      expect(out.data.content).toEqual({ type: 'doc', content: [] })
      expect(out.data.text).toBeUndefined()
      expect(out.data[flag]).toBe(true)
      expect(ctx.stats.commentsBlankedModerated).toBe(1)
    }
  )
})

describe('description scrub (SCRUB_DESCRIPTIONS)', () => {
  const contract = () => ({
    id: 'c1',
    question: 'Q',
    creator_id: USER,
    data: {
      id: 'c1',
      creatorId: USER,
      description: doc('mail a@b.co or call 201-555-0123'),
    },
  })

  test('off: description untouched', () => {
    const out = REDACTORS.contracts(contract(), makeCtx()) as Row
    expect(out.data.description.content[0].content[0].text).toBe(
      'mail a@b.co or call 201-555-0123'
    )
  })

  test('on: emails and phones scrubbed', () => {
    const out = REDACTORS.contracts(
      contract(),
      makeCtx({ scrubDescriptions: true })
    ) as Row
    expect(out.data.description.content[0].content[0].text).toBe(
      'mail [email removed] or call [phone removed]'
    )
  })
})

describe('vetted keys', () => {
  test('perp, sports and multi keys pass the unknown-key gate', () => {
    const row = {
      id: 'c1',
      data: {
        id: 'c1',
        initialProbabilities: { a1: 0.3 },
        fundingPeriodMs: 3600000,
        takerFeeBps: 30,
        takerFeeImpact: 0,
        takerFeeApiBps: 30,
        ticker: 'BTC',
        initialPoolLong: 1,
        initialPoolShort: 1,
        openInterestLong: 1,
        openInterestShort: 1,
        oracleSourceTime: 1,
        oracleFeedHealth: { checkedAt: 1, status: 'available' },
        resolvedOraclePrice: 1,
        solvencyHaltTime: null,
        solvencyHaltReason: null,
        sportsHomeTeam: 'Home',
        sportsAwayTeam: 'Away',
        sportsMarketType: 'moneyline',
        answers: [{ id: 'a1', p: 0.5 }],
      },
    }
    const args = {
      deliveredContractIds: new Set(['c1']),
      allUserIds: new Set<string>(),
      forbiddenStrings: [],
    }
    expect(scanBatch('contracts', [row], args).unknownKeyNames).toEqual([])
    const txn = {
      id: 't1',
      data: { data: { feeBps: 30, feeBase: 30, finalPrice: 1, orderId: 'o1' } },
    }
    expect(scanBatch('txns', [txn], args).unknownKeyNames).toEqual([])
  })
})
