import { CPMMMultiContract } from 'common/contract'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import { sportsCreator } from '../odds-markets'
import { resolveMarketHelper } from '../resolve-market-helpers'
import { getCompetitionSwitches } from '../supabase/sports-competition-switches'
import type {
  SupabaseDirectClient,
  SupabaseTransaction,
} from '../supabase/init'
import { getContract } from '../utils'
import { settleMajorGame, settlePendingMajorGames } from './settle-nba-game'

jest.mock('../odds-markets', () => ({ sportsCreator: jest.fn() }))
jest.mock('../resolve-market-helpers', () => ({
  resolveMarketHelper: jest.fn(),
}))
jest.mock('../supabase/sports-competition-switches', () => ({
  getCompetitionSwitches: jest.fn(),
}))
jest.mock('../utils', () => ({
  getContract: jest.fn(),
  log: { error: jest.fn() },
}))
const id = 'sixers-bucks'
const competition = 'nba-regular-2026-27'
const phase = 'Regular Season (BDL)'
const receipt = Date.parse('2026-11-21T20:46:05.674Z')
const facts = {
  sportsProvider: 'bdl',
  sportsLeagueKey: 'nba',
  sportsMarketType: 'moneyline',
  sportsStartKnown: true,
  sportsLiveStatus: 'FINISHED',
  sportsEventId: 'bdl:nba:21718156',
  sportsCompetitionId: competition,
  sportsStartTimestamp: '2026-11-21T18:00:00.000Z',
  sportsHomeTeamId: '23',
  sportsAwayTeamId: '17',
  sportsHomeTeam: 'Philadelphia 76ers',
  sportsAwayTeam: 'Milwaukee Bucks',
  sportsHomeScore: 132,
  sportsAwayScore: 129,
  sportsLiveUpdatedTime: receipt,
}
const away = {
  id: 'bucks-share',
  index: 0,
  text: facts.sportsAwayTeam,
  contractId: id,
}
const home = {
  id: 'sixers-share',
  index: 1,
  text: facts.sportsHomeTeam,
  contractId: id,
}
const original = {
  ...facts,
  sportsFinalObservation: facts,
  sportsFundedAnswerIds: [away.id, home.id],
  sportsEntrantIds: [17, 23],
  id,
  creatorId: MANIFOLD_SPORTS_USER_IDS[0],
  sportsProvider: 'bdl',
  sportsLeagueKey: 'nba',
  sportsStartKnown: true,
  sportsMarketType: 'moneyline',
  token: 'MANA',
  visibility: 'public',
  isResolved: false,
  closeTime: receipt - 1,
  sportsLiveStatus: 'FINISHED',
  mechanism: 'cpmm-multi-2',
  outcomeType: 'MULTIPLE_CHOICE',
  shouldAnswersSumToOne: true,
  addAnswersMode: 'DISABLED',
  answers: [away, home],
}
const fixture = (fields: Record<string, unknown> = {}) =>
  ({ ...original, ...fields } as unknown as CPMMMultiContract)
const oneOrNone = jest.fn()
const manyOrNone = jest.fn()
const pg = { manyOrNone } as unknown as SupabaseDirectClient
const tx = { oneOrNone } as unknown as SupabaseTransaction
const master = process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED
let current: CPMMMultiContract
let paid: string[]
beforeEach(() => {
  jest.resetAllMocks()
  process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED = 'true'
  jest.spyOn(Date, 'now').mockReturnValue(receipt + 60_000)
  paid = []
  current = fixture()
  jest.mocked(getContract).mockResolvedValue(current)
  oneOrNone.mockResolvedValue({ enabled: true })
  jest.mocked(getCompetitionSwitches).mockResolvedValue({
    [competition + ':' + phase]: true,
    [competition + ':Regular Season']: false,
  })
  jest
    .mocked(sportsCreator)
    .mockResolvedValue({ id: original.creatorId } as Awaited<
      ReturnType<typeof sportsCreator>
    >)
  jest
    .mocked(resolveMarketHelper)
    .mockImplementation(
      async (_market, _user, _creator, args, _stage, guard) => {
        if (!guard) throw new Error('no transaction guard')
        await guard(current, tx)
        paid.push(args.outcome)
        return { contract: current, userUpdates: [] }
      }
    )
})
afterEach(() => {
  jest.restoreAllMocks()
  if (master === undefined) delete process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED
  else process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED = master
})
it('pays the funded Philadelphia answer from the stored final after restart', async () => {
  await settleMajorGame(pg, id)
  expect(paid).toEqual([home.id])
  expect(jest.mocked(resolveMarketHelper).mock.calls[0][3]).toEqual({
    outcome: home.id,
    resolutions: { [home.id]: 100 },
  })
  expect(oneOrNone).toHaveBeenCalledWith(
    expect.stringMatching(/^select .*enabled for share$/i),
    [competition, phase]
  )
})

it.each([
  ['nhl', 'nhl-2026-27', phase, '2026-11-20', 5, 1],
  ['wnba', 'wnba-2027', 'Season (BDL)', '2027-08-14', 79, 81],
  ['mlb', 'mlb-2027', phase, '2027-08-14', 7, 0],
  ['nfl', 'nfl-regular-2027', phase, '2027-11-22', 24, 24],
] as const)(
  'pays the %s funded native answers according to its winner rules and exact switch',
  async (league, comp, fundedPhase, day, homeScore, awayScore) => {
    const start = day + 'T18:00:00.000Z'
    const at = Date.parse(start) + 4 * 3600_000
    jest.spyOn(Date, 'now').mockReturnValue(at + 1)
    const observation = {
      ...facts,
      sportsLeagueKey: league,
      sportsCompetitionId: comp,
      sportsCompetitionPhase: fundedPhase,
      sportsEventId: `bdl:${league}:101`,
      sportsStartTimestamp: start,
      sportsLiveUpdatedTime: at,
      sportsHomeScore: homeScore,
      sportsAwayScore: awayScore,
    }
    current = fixture({
      ...observation,
      sportsFinalObservation: observation,
      closeTime: at - 1,
    })
    jest.mocked(getContract).mockResolvedValue(current)
    const legacy = fundedPhase.replace(' (BDL)', '')
    jest.mocked(getCompetitionSwitches).mockResolvedValue({
      [comp + ':' + fundedPhase]: true,
      [comp + ':' + legacy]: false,
    })
    await settleMajorGame(pg, id)
    const winner = homeScore > awayScore ? home.id : away.id
    expect(jest.mocked(resolveMarketHelper).mock.calls[0][3]).toEqual(
      homeScore === awayScore
        ? {
            outcome: 'CHOOSE_MULTIPLE',
            resolutions: { [home.id]: 50, [away.id]: 50 },
          }
        : { outcome: winner, resolutions: { [winner]: 100 } }
    )
    expect(oneOrNone).toHaveBeenCalledWith(
      expect.stringContaining('enabled for share'),
      [comp, fundedPhase]
    )
  }
)
it('keeps the funded winner if the verified scoreboard listed the teams in reverse', async () => {
  const swapped = {
    ...facts,
    sportsHomeTeamId: '17',
    sportsAwayTeamId: '23',
    sportsHomeTeam: away.text,
    sportsAwayTeam: home.text,
    sportsHomeScore: 129,
    sportsAwayScore: 132,
  }
  current = fixture({ ...swapped, sportsFinalObservation: swapped })
  jest.mocked(getContract).mockResolvedValue(current)
  await settleMajorGame(pg, id)
  expect(paid).toEqual([home.id])
})
const invalid = [
  [
    'old FINISHED without an ordinary final',
    { sportsFinalObservation: undefined },
  ],
  ['missing funded answer IDs', { sportsFundedAnswerIds: undefined }],
  ['incomplete provider IDs', { sportsEntrantIds: [17, null] }],
  ['wrong native order', { sportsEntrantIds: [23, 17] }],
  [
    'replacement answer with the same label',
    { answers: [away, { ...home, id: 'new-id' }] },
  ],
  [
    'swapped answer labels',
    {
      answers: [
        { ...away, text: home.text },
        { ...home, text: away.text },
      ],
    },
  ],
  ['renamed answer', { answers: [away, { ...home, text: 'New name' }] }],
  ['duplicate labels', { answers: [away, { ...home, text: away.text }] }],
  ['unresolved source disagreement', { sportsHomeScore: 127 }],
  ['different game', { sportsEventId: 'bdl:nba:2' }],
  [
    'earlier date from another phase',
    { sportsStartTimestamp: '2025-11-21T18:00:00Z' },
  ],
  ['native close exactly at receipt', { closeTime: receipt }],
  ['prior manual decision', { sportsAttentionReason: 'Check fixture' }],
  ['another creator', { creatorId: 'another' }],
  ['fixture', { sportsFixture: true }],
  ['paid market', { isResolved: true }],
  ['resolved answer', { answers: [away, { ...home, resolution: 'NO' }] }],
  ['independent choices', { shouldAnswersSumToOne: false }],
  [
    'tie',
    {
      sportsHomeScore: 129,
      sportsFinalObservation: { ...facts, sportsHomeScore: 129 },
    },
  ],
] as const
it.each(invalid)(
  'holds %s at the precheck and on the transaction read',
  async (_name, fields) => {
    current = fixture(fields)
    jest.mocked(getContract).mockResolvedValueOnce(current)
    await settleMajorGame(pg, id)
    expect(resolveMarketHelper).not.toHaveBeenCalled()
    await expect(settleMajorGame(pg, id)).rejects.toThrow(/changed/)
    expect(paid).toEqual([])
  }
)
it('holds when the admin disables after the enabled precheck but before the payout transaction', async () => {
  oneOrNone.mockResolvedValueOnce(null)
  await expect(settleMajorGame(pg, id)).rejects.toThrow(/disabled/)
  expect(oneOrNone).toHaveBeenCalledWith(expect.stringContaining('for share'), [
    competition,
    phase,
  ])
  expect(paid).toEqual([])
  await settleMajorGame(pg, id)
  expect(paid).toEqual([home.id])
})
it('requires an explicit phase and honors a master shutdown while the guard awaits its read', async () => {
  jest.mocked(getCompetitionSwitches).mockResolvedValueOnce({})
  await settleMajorGame(pg, id)
  expect(resolveMarketHelper).not.toHaveBeenCalled()
  oneOrNone.mockImplementationOnce(async () => {
    delete process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED
    return { enabled: true }
  })
  await expect(settleMajorGame(pg, id)).rejects.toThrow(/disabled/)
  expect(paid).toEqual([])
  await settlePendingMajorGames(pg)
  expect(manyOrNone).not.toHaveBeenCalled()
})
it('rotates a bounded page of holds and lets an unrelated funded market proceed on the next page', async () => {
  const held = Array.from({ length: 20 }, (_, i) => ({ id: 'hold-' + i }))
  manyOrNone.mockResolvedValueOnce(held).mockResolvedValueOnce([{ id }])
  const cursor = await settlePendingMajorGames(pg)
  expect(cursor).toBe('hold-19')
  expect(paid).toEqual([])
  expect(await settlePendingMajorGames(pg, cursor)).toBe('')
  expect(manyOrNone.mock.calls[1][1]).toEqual([
    MANIFOLD_SPORTS_USER_IDS,
    cursor,
    expect.any(String),
    expect.arrayContaining(['nba', 'nhl', 'mlb', 'nfl', 'wnba']),
  ])
  expect(paid).toEqual([home.id])
})
