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
import { OddsApiEvent, OddsApiScore } from 'common/odds-markets'
import { User } from 'common/user'
import { getUser } from 'shared/utils'
import { getScores, getUpcomingOdds } from 'shared/the-odds-api-client'
import { runTxnOutsideBetQueue } from 'shared/txn/run-txn'
import { generateAntes } from 'shared/create-contract-helpers'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { resolveMarketHelper } from 'shared/resolve-market-helpers'
import { publishSportsLiveScore } from 'shared/publish-sports-live-score'
import {
  createOddsMarketsForCompetition,
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
 * advisory lock serializes transactions, not the earlier preview lookup. */
function database() {
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
    mechanism: 'cpmm-multi-1',
    shouldAnswersSumToOne: true,
    addAnswersMode: 'DISABLED',
    sportsHomeTeam: 'Home',
    sportsAwayTeam: 'Away',
  })
  expect(runTxnOutsideBetQueue).toHaveBeenCalledTimes(1)
  expect(generateAntes).toHaveBeenCalledTimes(1)
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
  expect(answers.map((a) => a.text)).toEqual(['Home', 'Away'])
  // -300 / +250 devigs to about 72.4% / 27.6%.
  expect(answers[0].prob).toBeCloseTo(0.724, 2)
  expect(answers[1].prob).toBeCloseTo(0.276, 2)
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
  expect(result.log.map((r) => r.eventId)).toEqual(['bowl'])
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

it('does not request scores when there are no in-play markets', async () => {
  await pollOddsScoresAndResolve(database().client)
  expect(getScores).not.toHaveBeenCalled()
  expect(getUser).not.toHaveBeenCalled()
})

it.each([
  [21, 7, { outcome: 'YES' }],
  [7, 21, { outcome: 'NO' }],
  [7, 7, { outcome: 'MKT', probabilityInt: 50 }],
])(
  'resolves a binary final %s–%s with the correct payload',
  async (home, away, resolution) => {
    const db = database()
    db.pg.manyOrNone.mockResolvedValue([
      {
        data: {
          id: 'game',
          mechanism: 'cpmm-1',
          outcomeType: 'BINARY',
          sportsHomeTeam: 'Home',
          sportsAwayTeam: 'Away',
          sportsEventId: 'odds:americanfootball_nfl:event',
          sportsStartTimestamp: new Date(Date.now() - 1000).toISOString(),
        },
      },
    ])
    const score: OddsApiScore = {
      ...event,
      completed: true,
      scores: [
        { name: 'Away', score: String(away) },
        { name: 'Home', score: String(home) },
      ],
      last_update: new Date().toISOString(),
    }
    jest.mocked(getScores).mockResolvedValue([score])
    const result = await pollOddsScoresAndResolve(db.client)
    expect(result.resolved).toBe(1)
    expect(resolveMarketHelper).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'game' }),
      creator,
      creator,
      resolution
    )
    expect(publishSportsLiveScore).toHaveBeenCalledWith(
      'game',
      expect.objectContaining({ sportsLiveStatus: 'FINISHED' })
    )
  }
)

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
    expect((await pollOddsScoresAndResolve(db.client)).resolved).toBe(1)
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
    expect((await pollOddsScoresAndResolve(db.client)).resolved).toBe(1)
    expect(resolveMarketHelper).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'game' }),
      creator,
      creator,
      { outcome: answerId, resolutions: { [answerId]: 100 } }
    )
  }
)
