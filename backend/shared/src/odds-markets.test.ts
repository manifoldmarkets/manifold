// Provider, database, and external side effects are mocked. The creation
// transaction and resolution routing below execute the real pipeline code.
jest.mock('shared/utils', () => ({
  getUser: jest.fn(),
  isProd: () => false,
  log: Object.assign(jest.fn(), { error: jest.fn() }),
  contractColumnsToSelect: 'data',
}))
jest.mock('shared/supabase/init', () => ({
  pgp: {
    as: {
      format: (sql: string, values: unknown[]) =>
        JSON.stringify({ sql, values }),
    },
  },
}))
jest.mock('shared/sports-goal-annotations', () => ({}))
jest.mock('shared/resolve-market-helpers', () => ({
  resolveMarketHelper: jest.fn(),
}))
jest.mock('shared/tiptap', () => ({
  anythingToRichText: () => ({ type: 'doc', content: [] }),
}))
jest.mock('shared/supabase/contracts', () => ({
  generateContractEmbeddings: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('shared/supabase/utils', () => ({
  bulkInsertQuery: () => 'insert answers',
}))
jest.mock('shared/supabase/answers', () => ({
  answerToRow: (answer: unknown) => answer,
}))
jest.mock('shared/create-contract-helpers', () => ({
  generateAntes: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('shared/txn/run-txn', () => ({
  runTxnOutsideBetQueue: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('shared/update-group-contracts-internal', () => ({
  addGroupToContract: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('shared/websockets/helpers', () => ({}))
jest.mock('shared/complete-quest-internal', () => ({
  completeCalculatedQuestFromTrigger: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('shared/notifications/create-new-contract-notif', () => ({}))
jest.mock('shared/notifications/create-new-contract-comment-notif', () => ({}))
jest.mock('shared/helpers/embeddings', () => ({}))
jest.mock('shared/the-odds-api-client', () => ({
  getUpcomingOdds: jest.fn(),
  getScores: jest.fn(),
}))
jest.mock('shared/publish-sports-live-score', () => ({
  publishSportsLiveScore: jest.fn().mockResolvedValue(undefined),
}))

import { Contract } from 'common/contract'
import { buildOddsMarketParams, OddsApiEvent } from 'common/odds-markets'
import { calendarEntriesFor } from 'common/sports-calendar'
import { VERSUS_COLORS } from 'common/new-contract'
import { gameAnswerColors } from 'common/sports-team-colors'
import { User } from 'common/user'
import { getUser, log } from 'shared/utils'
import { getScores, getUpcomingOdds } from 'shared/the-odds-api-client'
import { runTxnOutsideBetQueue } from 'shared/txn/run-txn'
import { generateAntes } from 'shared/create-contract-helpers'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { resolveMarketHelper } from 'shared/resolve-market-helpers'
import { publishSportsLiveScore } from 'shared/publish-sports-live-score'
import {
  createOddsMarketsForActiveCalendar,
  createOddsMarketsForCompetition,
  MAX_NEW_MARKETS_PER_RUN,
  newScorePollState,
  pollOddsScoresAndResolve,
} from './odds-markets'

// Pipeline code filters on Date.now(); pin it inside the NFL regular season,
// before the fixture's kickoff, so the fixtures never go stale.
const NOW = Date.parse('2026-09-10T12:00:00Z')

const creator = {
  id: 'sports-user',
  username: 'ManifoldSports',
  name: 'Sports',
  createdTime: 0,
} as User
const event: OddsApiEvent = {
  id: 'event',
  sport_key: 'americanfootball_nfl',
  sport_title: 'NFL',
  commence_time: '2026-09-13T17:00:00Z',
  home_team: 'Home',
  away_team: 'Away',
  bookmakers: [
    {
      key: 'book',
      title: 'Book',
      last_update: '',
      markets: [
        {
          key: 'h2h',
          last_update: '',
          outcomes: [
            { name: 'Home', price: -150 },
            { name: 'Away', price: 130 },
          ],
        },
      ],
    },
  ],
}

/** Minimal transactional store: inserts are invisible until commit; the
 * advisory lock serializes transactions, not the earlier preview lookup.
 * `onLock` runs as a transaction takes the lock. */
function database(opts: { onLock?: () => void } = {}) {
  const contracts: Contract[] = []
  const writes: string[] = []
  let tail = Promise.resolve()
  const oneOrNone = jest.fn(async (sql: string): Promise<unknown> => {
    if (sql.includes("data->>'sportsEventId'")) return contracts[0] ?? null
    if (sql.includes('from groups'))
      return { id: 'official', slug: 'official', privacy_status: 'curated' }
    return null
  })
  const pg = {
    oneOrNone,
    manyOrNone: jest.fn().mockResolvedValue([]),
    map: jest.fn().mockResolvedValue([]),
    none: jest.fn(async (sql: string) => {
      writes.push(sql)
    }),
    tx: async (run: (tx: SupabaseDirectClient) => Promise<Contract>) => {
      let unlock: (() => void) | undefined
      const inserted: Contract[] = []
      const tx = {
        oneOrNone,
        one: async () => {
          const previous = tail
          tail = new Promise<void>((resolve) => {
            unlock = resolve
          })
          await previous
          opts.onLock?.()
          return {}
        },
        none: async (encoded: string) => {
          const { values } = JSON.parse(encoded) as { values: [string, string] }
          inserted.push(JSON.parse(values[1]) as Contract)
        },
        // Multiple-choice markets insert the contract and its answers together.
        multi: async (query: string) => {
          const encoded = query.slice(0, query.lastIndexOf('; insert answers'))
          const { values } = JSON.parse(encoded) as { values: [string, string] }
          inserted.push(JSON.parse(values[1]) as Contract)
          return [[], []]
        },
      } as unknown as SupabaseDirectClient
      try {
        const result = await run(tx)
        contracts.push(...inserted)
        return result
      } finally {
        unlock?.()
      }
    },
  }
  return {
    pg,
    client: pg as unknown as SupabaseDirectClient,
    contracts,
    writes,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(Date, 'now').mockReturnValue(NOW)
  jest.mocked(getUser).mockResolvedValue(creator)
  jest.mocked(getUpcomingOdds).mockResolvedValue([event])
})

afterAll(() => {
  jest.restoreAllMocks()
})

it('concurrent create runs insert one versus market and charge one ante', async () => {
  const db = database()
  const results = await Promise.all([
    createOddsMarketsForCompetition(db.client, 'nfl-regular-2026', { creator }),
    createOddsMarketsForCompetition(db.client, 'nfl-regular-2026', { creator }),
  ])
  expect(results.reduce((n, r) => n + r.created, 0)).toBe(1)
  expect(results.reduce((n, r) => n + r.skipped, 0)).toBe(1)
  expect(db.contracts).toHaveLength(1)
  expect(db.contracts[0]).toMatchObject({
    outcomeType: 'MULTIPLE_CHOICE',
    // Opens at the line without discarding shares (#4102).
    mechanism: 'cpmm-multi-2',
    shouldAnswersSumToOne: true,
    addAnswersMode: 'DISABLED',
    sportsHomeTeam: 'Home',
    sportsAwayTeam: 'Away',
  })
  expect(runTxnOutsideBetQueue).toHaveBeenCalledTimes(1)
  expect(generateAntes).toHaveBeenCalledTimes(1)
})

it('creates only the games an admin picked from the dry run', async () => {
  jest
    .mocked(getUpcomingOdds)
    .mockResolvedValue([
      event,
      { ...event, id: 'picked', commence_time: '2026-09-14T00:20:00Z' },
    ])
  const db = database()
  const result = await createOddsMarketsForCompetition(
    db.client,
    'nfl-regular-2026',
    { creator, eventIds: ['picked'] }
  )
  expect(result.log.map((r) => r.eventId)).toEqual(['picked'])
  expect(result.created).toBe(1)
  expect(db.contracts).toHaveLength(1)
})

it('waits for a moneyline before creating a game', async () => {
  jest.mocked(getUpcomingOdds).mockResolvedValue([{ ...event, bookmakers: [] }])
  const db = database()
  const result = await createOddsMarketsForCompetition(
    db.client,
    'nfl-regular-2026',
    { creator }
  )
  expect(result.created).toBe(0)
  expect(result.log[0]).toMatchObject({
    status: 'skipped',
    reason: expect.stringContaining('no moneyline yet'),
  })
  expect(db.contracts).toHaveLength(0)
  expect(runTxnOutsideBetQueue).not.toHaveBeenCalled()
})

it('opens the answers at the devigged moneyline', async () => {
  jest.mocked(getUpcomingOdds).mockResolvedValue([
    {
      ...event,
      bookmakers: [
        {
          key: 'book',
          title: 'Book',
          last_update: '',
          markets: [
            {
              key: 'h2h',
              last_update: '',
              outcomes: [
                { name: 'Home', price: -300 },
                { name: 'Away', price: 250 },
              ],
            },
          ],
        },
      ],
    },
  ])
  const db = database()
  const result = await createOddsMarketsForCompetition(
    db.client,
    'nfl-regular-2026',
    { creator }
  )
  expect(result.created).toBe(1)
  const answers = (db.contracts[0] as any).answers as {
    text: string
    prob: number
  }[]
  // Away first, as in the "Away at Home" title.
  expect(answers.map((a) => a.text)).toEqual(['Away', 'Home'])
  // -300 / +250 devigs to about 72.4% / 27.6%.
  expect(answers[0].prob).toBeCloseTo(0.276, 2)
  expect(answers[1].prob).toBeCloseTo(0.724, 2)
})

it('colours the answers by team, and keeps the versus pair otherwise', async () => {
  const chiefs = 'Kansas City Chiefs'
  const bills = 'Buffalo Bills'
  const named: OddsApiEvent = {
    ...event,
    home_team: chiefs,
    away_team: bills,
    bookmakers: [
      {
        key: 'book',
        title: 'Book',
        last_update: '',
        markets: [
          {
            key: 'h2h',
            last_update: '',
            outcomes: [
              { name: chiefs, price: -150 },
              { name: bills, price: 130 },
            ],
          },
        ],
      },
    ],
  }
  const colorsFor = async (game: OddsApiEvent) => {
    jest.mocked(getUpcomingOdds).mockResolvedValue([game])
    const db = database()
    await createOddsMarketsForCompetition(db.client, 'nfl-regular-2026', {
      creator,
    })
    expect(db.contracts).toHaveLength(1)
    return (db.contracts[0] as any).answers.map(
      (a: { color?: string }) => a.color
    )
  }
  const [chiefsColor, billsColor] = gameAnswerColors(
    'nfl',
    chiefs,
    bills,
    false
  )!
  expect(await colorsFor(named)).toEqual([billsColor, chiefsColor])
  expect(await colorsFor(event)).toEqual(VERSUS_COLORS)
})

it('preview has no database writes, creator lookup, ante, or group lookup', async () => {
  const db = database()
  const result = await createOddsMarketsForCompetition(
    db.client,
    'nfl-regular-2026',
    { dryRun: true }
  )
  expect(result.log[0].status).toBe('dry-run')
  expect(db.contracts).toHaveLength(0)
  expect(db.writes).toEqual([])
  expect(getUser).not.toHaveBeenCalled()
  expect(runTxnOutsideBetQueue).not.toHaveBeenCalled()
  expect(
    db.pg.oneOrNone.mock.calls.some(([sql]) => sql.includes('groups'))
  ).toBe(false)
})

it('keeps a final-day US evening kickoff after midnight UTC', async () => {
  jest
    .mocked(getUpcomingOdds)
    .mockResolvedValue([{ ...event, commence_time: '2027-01-19T01:00:00Z' }])
  const result = await createOddsMarketsForCompetition(
    database().client,
    'nfl-playoffs-2027',
    { dryRun: true }
  )
  expect(result.log).toHaveLength(1)
})

it('creates college post-season games but not regular-season ones', async () => {
  jest.mocked(getUpcomingOdds).mockResolvedValue([
    { ...event, id: 'october', commence_time: '2026-10-17T19:30:00Z' },
    { ...event, id: 'bowl', commence_time: '2026-12-27T20:00:00Z' },
  ])
  const result = await createOddsMarketsForCompetition(
    database().client,
    'cfb-regular-2026',
    { dryRun: true }
  )
  expect(result.log.map((r) => [r.eventId, r.status])).toEqual([
    ['october', 'skipped'],
    ['bowl', 'dry-run'],
  ])
  expect(result.log[0].reason).toContain('Regular Season is off')
})

it("moves an existing market to the provider's new kickoff", async () => {
  const db = database()
  db.contracts.push({ id: 'existing' } as Contract)
  db.pg.oneOrNone.mockImplementation(async (sql: string) => {
    if (sql.includes("data->>'sportsStartTimestamp' as start"))
      return { start: '2026-09-14T00:20:00Z', resolution: null }
    if (sql.includes("data->>'sportsEventId'")) return { id: 'existing' }
    return null
  })
  const preview = await createOddsMarketsForCompetition(
    db.client,
    'nfl-regular-2026',
    { dryRun: true }
  )
  expect(preview.log[0].reason).toContain('would move its kickoff')
  expect(db.writes).toEqual([])

  const result = await createOddsMarketsForCompetition(
    db.client,
    'nfl-regular-2026',
    { creator }
  )
  expect(result.created).toBe(0)
  expect(result.log[0].reason).toContain('moved its kickoff')
  expect(db.pg.none).toHaveBeenCalledWith(
    expect.stringContaining('update contracts'),
    [
      JSON.stringify({
        sportsStartTimestamp: event.commence_time,
        closeTime: Date.parse(event.commence_time) + 4 * 60 * 60 * 1000,
      }),
      'existing',
    ]
  )
})

it('leaves a market alone when the kickoff has not moved', async () => {
  const db = database()
  db.pg.oneOrNone.mockImplementation(async (sql: string) => {
    if (sql.includes("data->>'sportsStartTimestamp' as start"))
      return { start: event.commence_time, resolution: null }
    if (sql.includes("data->>'sportsEventId'")) return { id: 'existing' }
    return null
  })
  const result = await createOddsMarketsForCompetition(
    db.client,
    'nfl-regular-2026',
    { creator }
  )
  expect(result.log[0].reason).toBe('market existing already exists')
  expect(db.writes).toEqual([])
})

it('contains a per-event lookup failure and continues to the next game', async () => {
  const db = database()
  db.pg.oneOrNone.mockRejectedValueOnce(new Error('lookup failed'))
  jest
    .mocked(getUpcomingOdds)
    .mockResolvedValue([event, { ...event, id: 'next' }])
  const result = await createOddsMarketsForCompetition(
    db.client,
    'nfl-regular-2026',
    { dryRun: true }
  )
  expect(result.errors).toBe(1)
  expect(result.log.map((r) => r.status)).toEqual(['error', 'dry-run'])
})

it('creates at most the per-run cap, soonest games first', async () => {
  const kickoff = (i: number) =>
    new Date(Date.parse('2026-09-13T17:00:00Z') + i * 60 * 60 * 1000)
      .toISOString()
      .replace('.000', '')
  const events = Array.from(
    { length: MAX_NEW_MARKETS_PER_RUN + 3 },
    (_, i) => ({
      ...event,
      id: `game-${i}`,
      commence_time: kickoff(i),
    })
  )
  jest.mocked(getUpcomingOdds).mockResolvedValue([...events].reverse())
  const result = await createOddsMarketsForCompetition(
    database().client,
    'nfl-regular-2026',
    { dryRun: true }
  )
  const planned = result.log.filter((r) => r.status === 'dry-run')
  expect(planned).toHaveLength(MAX_NEW_MARKETS_PER_RUN)
  expect(planned[0].eventId).toBe('game-0')
  expect(result.skipped).toBe(3)
  expect(result.log.at(-1)).toMatchObject({
    eventId: `game-${MAX_NEW_MARKETS_PER_RUN + 2}`,
    status: 'skipped',
    reason: expect.stringContaining('the next run continues'),
  })
})

it('alerts once an hour about a game still unresolved 3 hours after close', async () => {
  const stuck = (closeAgo: number) => [
    {
      data: {
        id: `stuck-${closeAgo}`,
        question: 'Away at Home',
        mechanism: 'cpmm-multi-1',
        outcomeType: 'MULTIPLE_CHOICE',
        closeTime: NOW - closeAgo,
        sportsEventId: 'odds:americanfootball_nfl:event',
        sportsStartTimestamp: new Date(NOW - 8 * 60 * 60 * 1000).toISOString(),
      },
    },
  ]
  jest.mocked(getScores).mockResolvedValue([])
  const poll = async (closeAgo: number, state = newScorePollState()) => {
    const db = database()
    db.pg.manyOrNone.mockResolvedValueOnce(stuck(closeAgo))
    return pollOddsScoresAndResolve(db.client, state)
  }

  // Not yet 3 hours after close: no alert.
  await poll(3 * 60 * 60 * 1000 - 60 * 1000)
  expect(log.error).not.toHaveBeenCalled()

  // Overdue: one alert, then none until an hour has passed.
  const state = newScorePollState()
  const overdue = 3 * 60 * 60 * 1000 + 10 * 60 * 1000
  expect((await poll(overdue, state)).pending).toBe(1)
  await poll(overdue, state)
  expect(log.error).toHaveBeenCalledTimes(1)
  jest.spyOn(Date, 'now').mockReturnValue(NOW + 61 * 60 * 1000)
  await poll(overdue, state)
  expect(log.error).toHaveBeenCalledTimes(2)
})

it('does not request scores when there are no in-play markets', async () => {
  await pollOddsScoresAndResolve(database().client, newScorePollState())
  expect(getScores).not.toHaveBeenCalled()
  expect(getUser).not.toHaveBeenCalled()
})

it('only looks for multiple choice game markets to resolve', async () => {
  // Binary game markets from an early build (dev only) are left for a person.
  const db = database()
  await pollOddsScoresAndResolve(db.client, newScorePollState())
  expect(db.pg.manyOrNone).toHaveBeenCalledWith(
    expect.stringContaining("mechanism in ('cpmm-multi-1', 'cpmm-multi-2')"),
    expect.anything()
  )
})

it.each([
  [24, 17, { outcome: 'home-answer', resolutions: { 'home-answer': 100 } }],
  [17, 24, { outcome: 'away-answer', resolutions: { 'away-answer': 100 } }],
  [
    20,
    20,
    {
      outcome: 'CHOOSE_MULTIPLE',
      resolutions: { 'home-answer': 50, 'away-answer': 50 },
    },
  ],
])(
  'resolves a versus final %s–%s, splitting a tie 50/50',
  async (home, away, resolution) => {
    const db = database()
    db.pg.manyOrNone
      .mockResolvedValueOnce([
        {
          data: {
            id: 'game',
            mechanism: 'cpmm-multi-1',
            outcomeType: 'MULTIPLE_CHOICE',
            sportsHomeTeam: 'Home',
            sportsAwayTeam: 'Away',
            sportsEventId: 'odds:americanfootball_nfl:event',
            sportsStartTimestamp: new Date(Date.now() - 1000).toISOString(),
          },
        },
      ])
      .mockResolvedValueOnce([
        { id: 'away-answer', text: 'Away', index: 1, contract_id: 'game' },
        { id: 'home-answer', text: 'Home', index: 0, contract_id: 'game' },
      ])
    jest.mocked(getScores).mockResolvedValue([
      {
        ...event,
        completed: true,
        scores: [
          { name: 'Away', score: String(away) },
          { name: 'Home', score: String(home) },
        ],
        last_update: null,
      },
    ])
    expect(
      (await pollOddsScoresAndResolve(db.client, newScorePollState())).resolved
    ).toBe(1)
    expect(resolveMarketHelper).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'game' }),
      creator,
      creator,
      resolution
    )
  }
)

it.each([
  [3, 1, 'home-answer'],
  [1, 3, 'away-answer'],
  [1, 1, 'draw-answer'],
])(
  'resolves a three-way final %s–%s by answer name',
  async (home, away, answerId) => {
    const db = database()
    db.pg.manyOrNone
      .mockResolvedValueOnce([
        {
          data: {
            id: 'game',
            mechanism: 'cpmm-multi-1',
            outcomeType: 'MULTIPLE_CHOICE',
            sportsHomeTeam: 'Home',
            sportsAwayTeam: 'Away',
            sportsEventId: 'odds:soccer_epl:event',
            sportsStartTimestamp: new Date(Date.now() - 1000).toISOString(),
          },
        },
      ])
      .mockResolvedValueOnce([
        { id: 'draw-answer', text: 'DRAW', contract_id: 'game' },
        { id: 'away-answer', text: ' Away ', contract_id: 'game' },
        { id: 'home-answer', text: 'Home', contract_id: 'game' },
      ])
    jest.mocked(getScores).mockResolvedValue([
      {
        ...event,
        sport_key: 'soccer_epl',
        completed: true,
        scores: [
          { name: 'Away', score: String(away) },
          { name: 'Home', score: String(home) },
        ],
        last_update: null,
      },
    ])
    expect(
      (await pollOddsScoresAndResolve(db.client, newScorePollState())).resolved
    ).toBe(1)
    expect(resolveMarketHelper).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'game' }),
      creator,
      creator,
      { outcome: answerId, resolutions: { [answerId]: 100 } }
    )
  }
)

describe('kickoff', () => {
  const kickoff = Date.parse(event.commence_time)
  const minute = 60 * 1000

  it("doesn't fund a game that kicks off while the odds are being fetched", async () => {
    // The request goes out a second before kickoff and answers two after.
    jest.spyOn(Date, 'now').mockReturnValue(kickoff - 1000)
    jest.mocked(getUpcomingOdds).mockImplementation(async () => {
      jest.spyOn(Date, 'now').mockReturnValue(kickoff + 2000)
      return [event]
    })
    const db = database()
    const result = await createOddsMarketsForCompetition(
      db.client,
      'nfl-regular-2026',
      { creator }
    )
    expect(result.created).toBe(0)
    expect(db.contracts).toHaveLength(0)
    expect(runTxnOutsideBetQueue).not.toHaveBeenCalled()
  })

  it('checks again inside the transaction, after the lock and before the ante', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(kickoff - 60 * minute)
    // By the time this run holds the lock, kickoff is a minute away.
    const db = database({
      onLock: () => jest.spyOn(Date, 'now').mockReturnValue(kickoff - minute),
    })
    const result = await createOddsMarketsForCompetition(
      db.client,
      'nfl-regular-2026',
      { creator }
    )
    expect(result.created).toBe(0)
    expect(result.errors).toBe(0)
    expect(result.log[0]).toMatchObject({
      status: 'skipped',
      reason: expect.stringContaining('kicked off'),
    })
    expect(db.contracts).toHaveLength(0)
    expect(runTxnOutsideBetQueue).not.toHaveBeenCalled()
  })

  it("won't open a game kicking off within five minutes", async () => {
    jest.spyOn(Date, 'now').mockReturnValue(kickoff - 4 * minute)
    const db = database()
    const result = await createOddsMarketsForCompetition(
      db.client,
      'nfl-regular-2026',
      { creator }
    )
    expect(result.created).toBe(0)
    expect(result.log[0]).toMatchObject({
      status: 'skipped',
      reason: expect.stringContaining('too soon'),
    })
    expect(runTxnOutsideBetQueue).not.toHaveBeenCalled()
  })

  it('still re-syncs an existing market whose kickoff moved to within five minutes', async () => {
    // Stored for 21:00; the provider corrects it to 17:00 at 16:56. Left at
    // 21:00, betting would stay open after the result is known.
    jest.spyOn(Date, 'now').mockReturnValue(kickoff - 4 * minute)
    const db = database()
    db.contracts.push({ id: 'existing' } as Contract)
    db.pg.oneOrNone.mockImplementation(async (sql: string) => {
      if (sql.includes("data->>'sportsStartTimestamp' as start"))
        return {
          start: new Date(kickoff + 4 * 60 * minute).toISOString(),
          resolution: null,
          question: null,
        }
      if (sql.includes("data->>'sportsEventId'")) return { id: 'existing' }
      return null
    })
    const result = await createOddsMarketsForCompetition(
      db.client,
      'nfl-regular-2026',
      { creator }
    )
    expect(result.log[0].reason).toContain('moved its kickoff')
    expect(db.pg.none).toHaveBeenCalledWith(
      expect.stringContaining('update contracts'),
      [expect.stringContaining(event.commence_time), 'existing']
    )
  })
})

describe("re-syncing a moved game's title", () => {
  const entry = calendarEntriesFor('nfl-regular-2026')[0]
  // A day earlier, so the date in the title differs.
  const oldStart = '2026-09-12T17:00:00Z'
  const oldTitle = buildOddsMarketParams(
    { ...event, commence_time: oldStart },
    entry
  ).question
  const newTitle = buildOddsMarketParams(event, entry).question

  const resync = async (question: string) => {
    const db = database()
    db.contracts.push({ id: 'existing' } as Contract)
    db.pg.oneOrNone.mockImplementation(async (sql: string) => {
      if (sql.includes("data->>'sportsStartTimestamp' as start"))
        return { start: oldStart, resolution: null, question }
      if (sql.includes("data->>'sportsEventId'")) return { id: 'existing' }
      return null
    })
    await createOddsMarketsForCompetition(db.client, 'nfl-regular-2026', {
      creator,
    })
    const calls = db.pg.none.mock.calls as unknown as [string, unknown[]][]
    const update = calls.find(([sql]) => sql.includes('update contracts'))
    return JSON.parse(update![1][0] as string)
  }

  it('moves the date in a title the pipeline wrote', async () => {
    expect(newTitle).not.toEqual(oldTitle)
    expect((await resync(oldTitle)).question).toBe(newTitle)
  })

  it('moves a title from before "[official]" was dropped', async () => {
    const patch = await resync(oldTitle + ' [official]')
    expect(patch.question).toBe(newTitle)
  })

  it('leaves a title someone edited', async () => {
    const patch = await resync('Bills at Chiefs: the rematch')
    expect(patch.question).toBeUndefined()
    expect(patch.sportsStartTimestamp).toBe(event.commence_time)
  })
})

describe('score feeds that disagree with the market', () => {
  const pendingGame = () => {
    const db = database()
    db.pg.manyOrNone
      .mockResolvedValueOnce([
        {
          data: {
            id: 'game',
            mechanism: 'cpmm-multi-1',
            outcomeType: 'MULTIPLE_CHOICE',
            sportsHomeTeam: 'Home',
            sportsAwayTeam: 'Away',
            sportsEventId: 'odds:americanfootball_nfl:event',
            sportsStartTimestamp: new Date(Date.now() - 1000).toISOString(),
          },
        },
      ])
      .mockResolvedValueOnce([
        { id: 'away-answer', text: 'Away', index: 1, contract_id: 'game' },
        { id: 'home-answer', text: 'Home', index: 0, contract_id: 'game' },
      ])
    return db
  }

  it("pays the market's home team when the feed lists the teams the other way round", async () => {
    const db = pendingGame()
    jest.mocked(getScores).mockResolvedValue([
      {
        ...event,
        home_team: 'Away',
        away_team: 'Home',
        completed: true,
        scores: [
          { name: 'Away', score: '14' },
          { name: 'Home', score: '21' },
        ],
        last_update: null,
      },
    ])
    expect(
      (await pollOddsScoresAndResolve(db.client, newScorePollState())).resolved
    ).toBe(1)
    expect(resolveMarketHelper).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'game' }),
      creator,
      creator,
      { outcome: 'home-answer', resolutions: { 'home-answer': 100 } }
    )
    expect(publishSportsLiveScore).toHaveBeenCalledWith(
      'game',
      expect.objectContaining({ sportsHomeScore: 21, sportsAwayScore: 14 })
    )
  })

  it("won't score or resolve a game the feed has for other teams", async () => {
    const db = pendingGame()
    jest.mocked(getScores).mockResolvedValue([
      {
        ...event,
        home_team: 'Somebody Else',
        completed: true,
        scores: [
          { name: 'Away', score: '14' },
          { name: 'Somebody Else', score: '21' },
        ],
        last_update: null,
      },
    ])
    expect(
      (await pollOddsScoresAndResolve(db.client, newScorePollState())).resolved
    ).toBe(0)
    expect(resolveMarketHelper).not.toHaveBeenCalled()
    expect(publishSportsLiveScore).not.toHaveBeenCalled()
  })
})

describe('admin switches', () => {
  // Rows from sports_competition_switches, through pg.map's row mapper.
  const switchRows =
    (rows: [string, string, boolean][]) =>
    async (sql: string, _values: unknown, map: (row: unknown) => unknown) =>
      sql.includes('sports_competition_switches')
        ? rows.map(([competition_id, phase, enabled]) =>
            map({
              competition_id,
              phase,
              enabled,
              updated_by: 'admin',
              updated_time: '2026-10-01T00:00:00Z',
            })
          )
        : []
  const requestedKeys = () =>
    jest.mocked(getUpcomingOdds).mock.calls.map(([key]) => key)

  beforeEach(() => {
    // Inside the NFL regular season, with the NHL's opening night two
    // weeks out.
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-01T12:00:00Z'))
  })

  it('the daily run creates only for switched-on phases', async () => {
    const db = database()
    db.pg.map.mockImplementation(
      switchRows([
        ['nfl-regular-2026', 'Regular Season', false],
        ['nhl-2026-27', 'Regular Season', true],
      ])
    )
    await createOddsMarketsForActiveCalendar(db.client)
    expect(requestedKeys()).toContain('icehockey_nhl')
    expect(requestedKeys()).toContain('soccer_epl')
    expect(requestedKeys()).not.toContain('americanfootball_nfl')
  })

  it("creates nothing if the switches can't be read", async () => {
    // The switches are the off switch for spending: the calendar's defaults
    // would create games an admin switched off.
    const db = database()
    db.pg.map.mockRejectedValue(new Error('relation does not exist'))
    expect(await createOddsMarketsForActiveCalendar(db.client)).toEqual({})
    expect(getUpcomingOdds).not.toHaveBeenCalled()
    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining('creates nothing')
    )
  })

  it("keeps a switched-off feed's open markets in sync with the provider", async () => {
    // The NFL is switched off with a market still open. The daily run still
    // fetches its games, moves that market to the kickoff the provider moved
    // it to, and creates nothing.
    const db = database()
    db.contracts.push({ id: 'existing' } as Contract)
    db.pg.map.mockImplementation(
      async (sql: string, _values: unknown, map: (row: unknown) => unknown) => {
        if (sql.includes('sports_competition_switches'))
          return [
            map({
              competition_id: 'nfl-regular-2026',
              phase: 'Regular Season',
              enabled: false,
              updated_by: 'admin',
              updated_time: '2026-10-01T00:00:00Z',
            }),
          ]
        if (sql.includes('split_part'))
          return [map({ sport_key: 'americanfootball_nfl' })]
        return []
      }
    )
    db.pg.oneOrNone.mockImplementation(
      async (sql: string, values?: unknown[]) => {
        if (sql.includes("data->>'sportsStartTimestamp' as start"))
          return { start: '2026-10-05T00:20:00Z', resolution: null }
        if (sql.includes("data->>'sportsEventId'"))
          return values?.[0] === 'odds:americanfootball_nfl:event'
            ? { id: 'existing' }
            : null
        return null
      }
    )
    const moved = { ...event, commence_time: '2026-10-04T17:00:00Z' }
    const fresh = { ...event, id: 'new', commence_time: '2026-10-11T17:00:00Z' }
    jest
      .mocked(getUpcomingOdds)
      .mockImplementation(async (key) =>
        key === 'americanfootball_nfl' ? [moved, fresh] : []
      )
    await createOddsMarketsForActiveCalendar(db.client)
    expect(requestedKeys()).toContain('americanfootball_nfl')
    expect(db.pg.none).toHaveBeenCalledWith(
      expect.stringContaining('update contracts'),
      [expect.stringContaining(moved.commence_time), 'existing']
    )
    expect(runTxnOutsideBetQueue).not.toHaveBeenCalled()
    expect(db.contracts).toHaveLength(1)
  })

  it("doesn't create a game inside a phase that's off, even where another phase's dates cover it", async () => {
    // The CFP window (18 Dec to 25 Jan) overlaps the bowl season's (12 Dec
    // to 1 Jan) on the one college football feed. With the bowls switched
    // off, a 30 Dec game isn't created through the CFP; a 15 Jan one is.
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-12-20T12:00:00Z'))
    jest.mocked(getUpcomingOdds).mockResolvedValue([
      { ...event, id: 'bowl', commence_time: '2026-12-30T20:00:00Z' },
      { ...event, id: 'semi', commence_time: '2027-01-15T01:00:00Z' },
    ])
    const result = await createOddsMarketsForCompetition(
      database().client,
      'cfb-cfp-2027',
      { dryRun: true, switches: { 'cfb-regular-2026:Bowl Season': false } }
    )
    expect(result.log.map((r) => [r.eventId, r.status])).toEqual([
      ['bowl', 'skipped'],
      ['semi', 'dry-run'],
    ])
    expect(result.log[0].reason).toContain('Bowl Season is off')
    // With the bowls on, both are created.
    const both = await createOddsMarketsForCompetition(
      database().client,
      'cfb-cfp-2027',
      { dryRun: true }
    )
    expect(both.log.map((r) => r.status)).toEqual(['dry-run', 'dry-run'])
  })

  it('never creates in a locked phase, even switched on', async () => {
    jest.mocked(getUpcomingOdds).mockResolvedValue([
      { ...event, id: 'regular', commence_time: '2026-10-11T20:00:00Z' },
      { ...event, id: 'playoff', commence_time: '2026-10-25T20:00:00Z' },
    ])
    const result = await createOddsMarketsForCompetition(
      database().client,
      'mls-2026',
      {
        dryRun: true,
        switches: {
          'mls-2026:Regular Season': true,
          'mls-2026:MLS Cup Playoffs': true,
        },
      }
    )
    expect(result.log.map((r) => r.eventId)).toEqual(['regular'])
  })
})

it.each(['icehockey_nhl', 'basketball_nba', 'baseball_mlb'])(
  'leaves a level %s final for a person instead of splitting it',
  async (sportKey) => {
    // These games play on until someone wins, so a level final is missing its
    // decider (an NHL shootout, say).
    const db = database()
    db.pg.manyOrNone
      .mockResolvedValueOnce([
        {
          data: {
            id: 'game',
            mechanism: 'cpmm-multi-2',
            outcomeType: 'MULTIPLE_CHOICE',
            sportsHomeTeam: 'Home',
            sportsAwayTeam: 'Away',
            sportsEventId: `odds:${sportKey}:event`,
            sportsStartTimestamp: new Date(Date.now() - 1000).toISOString(),
          },
        },
      ])
      // Answers that would resolve 50/50 if the final were let through.
      .mockResolvedValueOnce([
        { id: 'home-answer', text: 'Home', index: 0, contract_id: 'game' },
        { id: 'away-answer', text: 'Away', index: 1, contract_id: 'game' },
      ])
    jest.mocked(getScores).mockResolvedValue([
      {
        ...event,
        sport_key: sportKey,
        completed: true,
        scores: [
          { name: 'Away', score: '2' },
          { name: 'Home', score: '2' },
        ],
        last_update: null,
      },
    ])
    const result = await pollOddsScoresAndResolve(
      db.client,
      newScorePollState()
    )
    expect(result.resolved).toBe(0)
    expect(result.errors).toBe(1)
    expect(resolveMarketHelper).not.toHaveBeenCalled()
  }
)

describe('score polling settings', () => {
  const MINUTE = 60 * 1000
  // Rows from sports_score_polling, through pg.map's row mapper.
  const polling =
    (rows: [string, number][]) =>
    async (sql: string, _values: unknown, map: (row: unknown) => unknown) =>
      sql.includes('sports_score_polling')
        ? rows.map(([target, interval_seconds]) =>
            map({
              target,
              interval_seconds,
              updated_by: 'admin',
              updated_time: '2026-09-01T00:00:00Z',
            })
          )
        : []
  const nflGame = (startedAgo: number) => [
    {
      data: {
        id: 'game',
        mechanism: 'cpmm-multi-2',
        outcomeType: 'MULTIPLE_CHOICE',
        sportsHomeTeam: 'Home',
        sportsAwayTeam: 'Away',
        sportsLeague: 'NFL',
        sportsEventId: 'odds:americanfootball_nfl:event',
        sportsStartTimestamp: new Date(NOW - startedAgo).toISOString(),
        closeTime: NOW - startedAgo + 240 * MINUTE,
      },
    },
  ]

  it('with live scores off, asks only once a game is due to end', async () => {
    const db = database()
    db.pg.map.mockImplementation(polling([['sport:nfl', 0]]))
    db.pg.manyOrNone.mockResolvedValueOnce(nflGame(60 * MINUTE))
    await pollOddsScoresAndResolve(db.client, newScorePollState())
    expect(getScores).not.toHaveBeenCalled()

    // NFL games are due to end 3 hours in; finished games cost 2 credits.
    db.pg.manyOrNone.mockResolvedValueOnce(nflGame(181 * MINUTE))
    await pollOddsScoresAndResolve(db.client, newScorePollState())
    expect(getScores).toHaveBeenCalledWith('americanfootball_nfl', {
      finishedDays: 3,
    })
  })

  it("doesn't write live scores for a sport that has them off", async () => {
    const db = database()
    db.pg.map.mockImplementation(polling([['sport:nfl', 0]]))
    // Due to end but still going: overtime.
    db.pg.manyOrNone.mockResolvedValueOnce(nflGame(190 * MINUTE))
    jest.mocked(getScores).mockResolvedValue([
      {
        ...event,
        completed: false,
        scores: [
          { name: 'Away', score: '20' },
          { name: 'Home', score: '20' },
        ],
        last_update: null,
      },
    ])
    const result = await pollOddsScoresAndResolve(
      db.client,
      newScorePollState()
    )
    expect(result.polled).toBe(1)
    expect(result.live).toBe(0)
    expect(db.writes).toEqual([])
    expect(publishSportsLiveScore).not.toHaveBeenCalled()
  })

  it('asks for live games only while no game is due to end', async () => {
    const db = database()
    jest
      .mocked(getScores)
      .mockResolvedValue([
        { ...event, completed: false, scores: null, last_update: null },
      ])
    db.pg.manyOrNone.mockResolvedValueOnce(nflGame(60 * MINUTE))
    await pollOddsScoresAndResolve(db.client, newScorePollState())
    expect(jest.mocked(getScores).mock.calls).toEqual([
      ['americanfootball_nfl', {}],
    ])
  })

  it("polls finals only, live scores off, if the settings can't be read, and says so hourly", async () => {
    // The settings are the off switch for spending credits: the defaults
    // would write live scores for a sport an admin switched off. Finals
    // can't be switched off, so they still run and games resolve.
    const db = database()
    const state = newScorePollState()
    db.pg.map.mockRejectedValue(new Error('relation does not exist'))
    db.pg.manyOrNone.mockResolvedValueOnce(nflGame(60 * MINUTE))
    expect((await pollOddsScoresAndResolve(db.client, state)).polled).toBe(0)
    expect(getScores).not.toHaveBeenCalled()
    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining('finals only')
    )
    // Due to end and still going: asked with finished games, no live score
    // written.
    jest.mocked(getScores).mockResolvedValue([
      {
        ...event,
        completed: false,
        scores: [
          { name: 'Away', score: '20' },
          { name: 'Home', score: '20' },
        ],
        last_update: null,
      },
    ])
    db.pg.manyOrNone.mockResolvedValueOnce(nflGame(190 * MINUTE))
    const result = await pollOddsScoresAndResolve(db.client, state)
    expect(getScores).toHaveBeenCalledWith('americanfootball_nfl', {
      finishedDays: 3,
    })
    expect(result.live).toBe(0)
    expect(db.writes).toEqual([])
    expect(log.error).toHaveBeenCalledTimes(1)
    // An hour on, it says so again.
    jest.spyOn(Date, 'now').mockReturnValue(NOW + 61 * MINUTE)
    db.pg.manyOrNone.mockResolvedValueOnce(nflGame(190 * MINUTE))
    await pollOddsScoresAndResolve(db.client, state)
    expect(log.error).toHaveBeenCalledTimes(2)
  })

  it('keeps the live scores when only the finished-games call fails', async () => {
    // Two NFL games an hour in: one still listed live, one gone. The second
    // call fails, so the first response is used: the live score is written,
    // the missing game is flagged, and nothing backs off.
    const db = database()
    const state = newScorePollState()
    const two = () => [
      ...nflGame(60 * MINUTE),
      {
        data: {
          ...nflGame(60 * MINUTE)[0].data,
          id: 'gone',
          sportsEventId: 'odds:americanfootball_nfl:gone',
        },
      },
    ]
    db.pg.manyOrNone.mockResolvedValueOnce(two()).mockResolvedValueOnce(two())
    jest
      .mocked(getScores)
      .mockResolvedValueOnce([
        {
          ...event,
          completed: false,
          scores: [
            { name: 'Away', score: '3' },
            { name: 'Home', score: '7' },
          ],
          last_update: null,
        },
      ])
      .mockRejectedValueOnce(new Error('503'))
      .mockResolvedValue([])
    const result = await pollOddsScoresAndResolve(db.client, state)
    expect(result.live).toBe(1)
    expect(result.pending).toBe(1)
    expect(publishSportsLiveScore).toHaveBeenCalledWith(
      'game',
      expect.objectContaining({ sportsHomeScore: 7, sportsAwayScore: 3 })
    )
    // Five minutes on: due again (no backoff), one call with finished games.
    jest.spyOn(Date, 'now').mockReturnValue(NOW + 5 * MINUTE)
    await pollOddsScoresAndResolve(db.client, state)
    expect(jest.mocked(getScores).mock.calls).toEqual([
      ['americanfootball_nfl', {}],
      ['americanfootball_nfl', { finishedDays: 3 }],
      ['americanfootball_nfl', { finishedDays: 3 }],
    ])
  })

  it('publishes the source score age separately from the successful poll time', async () => {
    const db = database()
    db.pg.manyOrNone.mockResolvedValueOnce(nflGame(60 * MINUTE))
    jest.mocked(getScores).mockResolvedValueOnce([
      {
        ...event,
        completed: false,
        scores: [
          { name: 'Home', score: '7' },
          { name: 'Away', score: '3' },
        ],
        last_update: new Date(NOW - 5 * MINUTE).toISOString(),
      },
    ])
    await pollOddsScoresAndResolve(db.client, newScorePollState())
    expect(publishSportsLiveScore).toHaveBeenCalledWith(
      'game',
      expect.objectContaining({
        sportsLiveUpdatedTime: NOW,
        sportsScoreUpdatedTime: NOW - 5 * MINUTE,
      })
    )
  })

  it("keeps asking for finished games, in one call, for a completed game it can't resolve", async () => {
    // An NHL game comes back completed and level, which the resolver leaves
    // for a person. Later polls include finished games in their one call
    // rather than asking twice every tick.
    const db = database()
    const state = newScorePollState()
    const nhl = () => [
      {
        data: {
          ...nflGame(60 * MINUTE)[0].data,
          sportsLeague: 'NHL',
          sportsEventId: 'odds:icehockey_nhl:event',
        },
      },
    ]
    db.pg.manyOrNone.mockResolvedValueOnce(nhl()).mockResolvedValueOnce(nhl())
    const level = {
      ...event,
      sport_key: 'icehockey_nhl',
      completed: true,
      scores: [
        { name: 'Away', score: '2' },
        { name: 'Home', score: '2' },
      ],
      last_update: null,
    }
    jest.mocked(getScores).mockResolvedValueOnce([]).mockResolvedValue([level])
    expect((await pollOddsScoresAndResolve(db.client, state)).errors).toBe(1)
    jest.spyOn(Date, 'now').mockReturnValue(NOW + 5 * MINUTE)
    expect((await pollOddsScoresAndResolve(db.client, state)).errors).toBe(1)
    expect(jest.mocked(getScores).mock.calls).toEqual([
      ['icehockey_nhl', {}],
      ['icehockey_nhl', { finishedDays: 3 }],
      ['icehockey_nhl', { finishedDays: 3 }],
    ])
    expect(resolveMarketHelper).not.toHaveBeenCalled()
  })

  it('forgets a flagged game once the resolver stops watching it', async () => {
    const db = database()
    const state = newScorePollState()
    jest.mocked(getScores).mockResolvedValue([])
    db.pg.manyOrNone.mockResolvedValueOnce(nflGame(60 * MINUTE))
    await pollOddsScoresAndResolve(db.client, state)
    expect(Object.keys(state.missing)).toEqual(['game'])
    db.pg.manyOrNone.mockResolvedValueOnce([])
    await pollOddsScoresAndResolve(db.client, state)
    expect(state.missing).toEqual({})
  })

  it('checks for a final the moment a started game drops out of the live scores', async () => {
    // An hour into an NFL game (due to end at three), the live-only call no
    // longer lists it: it finished early. The same tick asks for finished
    // games and resolves it, rather than two hours on at the finals check.
    const db = database()
    db.pg.manyOrNone
      .mockResolvedValueOnce(nflGame(60 * MINUTE))
      .mockResolvedValueOnce([
        { id: 'away-answer', text: 'Away', index: 1, contract_id: 'game' },
        { id: 'home-answer', text: 'Home', index: 0, contract_id: 'game' },
      ])
    jest
      .mocked(getScores)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          ...event,
          completed: true,
          scores: [
            { name: 'Away', score: '14' },
            { name: 'Home', score: '21' },
          ],
          last_update: null,
        },
      ])
    const result = await pollOddsScoresAndResolve(
      db.client,
      newScorePollState()
    )
    expect(jest.mocked(getScores).mock.calls).toEqual([
      ['americanfootball_nfl', {}],
      ['americanfootball_nfl', { finishedDays: 3 }],
    ])
    expect(result.resolved).toBe(1)
    expect(resolveMarketHelper).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'game' }),
      creator,
      creator,
      { outcome: 'home-answer', resolutions: { 'home-answer': 100 } }
    )
  })

  it('keeps asking for finished games while a started game is missing from the feed', async () => {
    // Still missing with finished games included: postponed, or not filed
    // yet. Later polls keep including finished games rather than going back
    // to live-only calls until the finals check.
    const db = database()
    const state = newScorePollState()
    jest.mocked(getScores).mockResolvedValue([])
    db.pg.manyOrNone.mockResolvedValueOnce(nflGame(60 * MINUTE))
    await pollOddsScoresAndResolve(db.client, state)
    jest.spyOn(Date, 'now').mockReturnValue(NOW + 5 * MINUTE)
    db.pg.manyOrNone.mockResolvedValueOnce(nflGame(60 * MINUTE))
    await pollOddsScoresAndResolve(db.client, state)
    expect(jest.mocked(getScores).mock.calls).toEqual([
      ['americanfootball_nfl', {}],
      ['americanfootball_nfl', { finishedDays: 3 }],
      ['americanfootball_nfl', { finishedDays: 3 }],
    ])
  })

  it("doesn't double the cost of live polls while a postponed game waits", async () => {
    // A live game polled every 30 seconds, next to a game the feed no longer
    // lists (postponed) whose finals check ran a minute ago. The live poll
    // stays a 1-credit live-only call, with no follow-up for the missing game.
    const db = database()
    const state = newScorePollState()
    state.missing.postponed = NOW - 10 * MINUTE
    state.lastPolled.americanfootball_nfl = NOW - 40 * 1000
    state.lastFinished.americanfootball_nfl = NOW - MINUTE
    db.pg.map.mockImplementation(polling([['sport:nfl', 30]]))
    const [live] = nflGame(30 * MINUTE)
    const [postponed] = nflGame(60 * MINUTE)
    db.pg.manyOrNone.mockResolvedValueOnce([
      live,
      {
        data: {
          ...postponed.data,
          id: 'postponed',
          sportsEventId: 'odds:americanfootball_nfl:postponed',
        },
      },
    ])
    jest.mocked(getScores).mockResolvedValue([
      {
        ...event,
        completed: false,
        scores: [
          { name: 'Away', score: '7' },
          { name: 'Home', score: '3' },
        ],
        last_update: null,
      },
    ])
    const result = await pollOddsScoresAndResolve(db.client, state)
    expect(jest.mocked(getScores).mock.calls).toEqual([
      ['americanfootball_nfl', {}],
    ])
    expect(result.live).toBe(1)
  })

  it('waits twice as long per failed scores call in a row, up to half an hour', async () => {
    const db = database()
    const state = newScorePollState()
    jest.mocked(getScores).mockRejectedValue(new Error('503'))
    const tick = async (minutesOn: number) => {
      jest.spyOn(Date, 'now').mockReturnValue(NOW + minutesOn * MINUTE)
      db.pg.manyOrNone.mockResolvedValueOnce(nflGame(60 * MINUTE))
      await pollOddsScoresAndResolve(db.client, state)
      return jest.mocked(getScores).mock.calls.length
    }
    expect(await tick(0)).toBe(1)
    // The 5-minute default: after one failure the next call waits 10.
    expect(await tick(5)).toBe(1)
    expect(await tick(10)).toBe(2)
    // Two failures: 20 minutes.
    expect(await tick(20)).toBe(2)
    expect(await tick(30)).toBe(3)
    // Three: 40 would be next, but half an hour is the most.
    expect(await tick(55)).toBe(3)
    expect(await tick(60)).toBe(4)
    // A call that works resets the wait.
    jest
      .mocked(getScores)
      .mockResolvedValue([
        { ...event, completed: false, scores: null, last_update: null },
      ])
    expect(await tick(90)).toBe(5)
    expect(await tick(95)).toBe(6)
  })
})

it("logs an error when a competition can't run, so it alerts", async () => {
  // An exhausted quota or a provider outage fails the odds fetch.
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-01T12:00:00Z'))
  jest
    .mocked(getUpcomingOdds)
    .mockRejectedValue(
      new Error(
        'Odds API /odds error for americanfootball_nfl: 401 Unauthorized'
      )
    )
  await createOddsMarketsForActiveCalendar(database().client)
  expect(log.error).toHaveBeenCalledWith(
    expect.stringContaining("nfl-regular-2026 didn't run")
  )
})

it('backs off across the switch from live polls to a finals check', async () => {
  // Six failed 30-second live polls reach the half-hour cap just before the
  // NFL game is due to end. The finals check that comes due 10 seconds
  // after the sixth failure waits out the cooldown too.
  const db = database()
  const state = newScorePollState()
  db.pg.map.mockImplementation(
    async (sql: string, _values: unknown, map: (row: unknown) => unknown) =>
      sql.includes('sports_score_polling')
        ? [map({ target: 'sport:nfl', interval_seconds: 30 })]
        : []
  )
  db.pg.manyOrNone.mockResolvedValue([
    {
      data: {
        id: 'game',
        mechanism: 'cpmm-multi-2',
        outcomeType: 'MULTIPLE_CHOICE',
        sportsHomeTeam: 'Home',
        sportsAwayTeam: 'Away',
        sportsLeague: 'NFL',
        sportsEventId: 'odds:americanfootball_nfl:event',
        sportsStartTimestamp: new Date(NOW - 180 * 60_000).toISOString(),
        closeTime: NOW + 60 * 60_000,
      },
    },
  ])
  jest.mocked(getScores).mockRejectedValue(new Error('503'))
  for (const seconds of [-1870, -1810, -1690, -1450, -970, -10]) {
    jest.spyOn(Date, 'now').mockReturnValue(NOW + seconds * 1000)
    await pollOddsScoresAndResolve(db.client, state)
  }
  expect(getScores).toHaveBeenCalledTimes(6)
  expect(state.failures.americanfootball_nfl).toBe(6)
  jest.spyOn(Date, 'now').mockReturnValue(NOW)
  await pollOddsScoresAndResolve(db.client, state)
  expect(getScores).toHaveBeenCalledTimes(6)
  // Half an hour after the last attempt, the finals check goes out.
  jest.spyOn(Date, 'now').mockReturnValue(NOW + 1790 * 1000)
  await pollOddsScoresAndResolve(db.client, state)
  expect(jest.mocked(getScores).mock.calls.at(-1)).toEqual([
    'americanfootball_nfl',
    { finishedDays: 3 },
  ])
})
