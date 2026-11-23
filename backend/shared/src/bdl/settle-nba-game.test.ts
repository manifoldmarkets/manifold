import { CPMMMultiContract, Sports } from 'common/contract'
import { sportsCreator } from '../odds-markets'
import { resolveMarketHelper } from '../resolve-market-helpers'
import { getContract } from '../utils'
import type { SupabaseDirectClient } from '../supabase/init'
import { settleNbaGame } from './settle-nba-game'

jest.mock('../odds-markets', () => ({ sportsCreator: jest.fn() }))
jest.mock('../resolve-market-helpers', () => ({
  resolveMarketHelper: jest.fn(),
}))
jest.mock('../utils', () => ({ getContract: jest.fn() }))
const pg = {} as SupabaseDirectClient
const id = 'sixers-bucks'
const identity = {
  sportsEventId: 'bdl:nba:21718156',
  sportsCompetitionId: 'nba-regular-2026-27',
  sportsStartTimestamp: '2026-11-21T18:00:00.000Z',
  sportsHomeTeamId: '23',
  sportsAwayTeamId: '17',
  sportsHomeTeam: 'Philadelphia 76ers',
  sportsAwayTeam: 'Milwaukee Bucks',
}
const score = {
  sportsLiveStatus: 'FINISHED',
  sportsHomeScore: 132,
  sportsAwayScore: 129,
  sportsLiveUpdatedTime: Date.parse('2026-11-21T20:46:05.674Z'),
  sportsLiveMinute: null,
}
const yes = async () => true
const away = { id: 'answer-bucks', text: identity.sportsAwayTeam, index: 0 },
  home = { id: 'answer-sixers', text: identity.sportsHomeTeam, index: 1 }
const original = {
  ...identity,
  ...score,
  id,
  creatorId: 'sports-bot',
  token: 'MANA',
  visibility: 'public',
  closeTime: score.sportsLiveUpdatedTime - 1,
  isResolved: false,
  sportsProvider: 'bdl',
  sportsLeagueKey: 'nba',
  sportsStartKnown: true,
  sportsMarketType: 'moneyline',
  mechanism: 'cpmm-multi-2',
  outcomeType: 'MULTIPLE_CHOICE',
  shouldAnswersSumToOne: true,
  answers: [away, home],
}
type Native = CPMMMultiContract & Sports & typeof score
const fixture = (fields: Record<string, unknown> = {}) =>
  ({ ...original, ...fields } as unknown as Native)
let inside: Native
let payouts: string[]
const master = process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED
beforeEach(() => {
  process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED = 'true'
  jest.clearAllMocks()
  inside = fixture()
  payouts = []
  jest.mocked(getContract).mockResolvedValue(fixture())
  jest
    .mocked(sportsCreator)
    .mockResolvedValue({ id: original.creatorId } as Awaited<
      ReturnType<typeof sportsCreator>
    >)
  jest
    .mocked(resolveMarketHelper)
    .mockImplementation(
      async (_before, _actor, _owner, args, _stage, assertResolvable) => {
        if (!assertResolvable)
          throw new Error('Missing final-transaction guard')
        assertResolvable(inside)
        payouts.push(args.outcome)
        return { contract: inside, userUpdates: [] }
      }
    )
})
afterAll(() => {
  if (master === undefined) delete process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED
  else process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED = master
})
it('selects the actual named native answer with the away entrant first', async () => {
  await settleNbaGame(pg, id, identity, score, yes)
  expect(payouts).toEqual([home.id])
  expect(jest.mocked(resolveMarketHelper).mock.calls[0][3]).toEqual({
    outcome: home.id,
    resolutions: { [home.id]: 100 },
  })
})
it('pays the away answer by name when it wins even with a reordered native list', async () => {
  const awayWin = { ...score, sportsAwayScore: 135 }
  inside = fixture({ ...awayWin, answers: [home, away] })
  jest.mocked(getContract).mockResolvedValue(inside)
  await settleNbaGame(pg, id, identity, awayWin, yes)
  expect(payouts).toEqual([away.id])
})
it.each([
  ['renamed native answer', { answers: [away, { ...home, text: 'Renamed' }] }],
  [
    'both native answers name the winner',
    { answers: [{ ...away, text: home.text }, home] },
  ],
  [
    'additional answer',
    { answers: [away, home, { id: 'draw', text: 'Draw', index: 2 }] },
  ],
  [
    'prior manual decision',
    { sportsAttentionReason: 'Team identity disputed' },
  ],
  ['resolved answer', { answers: [away, { ...home, resolution: 'NO' }] }],
])('holds a %s before calling resolution', async (_label, fields) => {
  jest
    .mocked(getContract)
    .mockResolvedValue(fixture(fields as Record<string, unknown>))
  await expect(settleNbaGame(pg, id, identity, score, yes)).rejects.toThrow(
    /no longer match/
  )
  expect(resolveMarketHelper).not.toHaveBeenCalled()
})
it.each([
  [
    'opposing funded answer IDs switched',
    {
      answers: [
        { ...home, id: away.id },
        { ...away, id: home.id },
      ],
    },
  ],
  ['participant replaced', { sportsHomeTeamId: '99' }],
  ['event rebound', { sportsEventId: 'bdl:nba:123' }],
  ['corrected final', { sportsHomeScore: 104 }],
  ['new receipt', { sportsLiveUpdatedTime: score.sportsLiveUpdatedTime + 1 }],
  [
    'still tradable at the receipt millisecond',
    { closeTime: score.sportsLiveUpdatedTime },
  ],
  ['trading reopened', { closeTime: score.sportsLiveUpdatedTime + 1000 }],
  ['hidden market', { visibility: 'private' }],
  ['already paid', { isResolved: true }],
  ['other provider', { sportsProvider: 'odds' }],
  ['fixture', { sportsFixture: true }],
])('checks %s inside the payout transaction', async (_label, fields) => {
  inside = fixture(fields as Record<string, unknown>)
  await expect(settleNbaGame(pg, id, identity, score, yes)).rejects.toThrow(
    /before settlement/
  )
  expect(payouts).toEqual([])
})
it('stops a queued native payout if the scheduler deadline expires before the transaction checks its fixture', async () => {
  const controller = new AbortController()
  const enabled = async () => true
  jest
    .mocked(resolveMarketHelper)
    .mockImplementationOnce(
      async (_before, _actor, _owner, _args, _stage, check) => {
        controller.abort()
        if (!check) throw new Error('Missing transaction guard')
        check(inside)
        throw new Error('Expired run accepted the payout')
      }
    )
  await expect(
    settleNbaGame(pg, id, identity, score, enabled, controller.signal)
  ).rejects.toThrow(/before settlement/)
  expect(payouts).toEqual([])
})

it('does not call settlement when the phase has just been disabled or a terminal score is missing, malformed, or level', async () => {
  await settleNbaGame(pg, id, identity, score, async () => false)
  for (const sportsHomeScore of [null, -1, 1.5, 129, Infinity])
    await settleNbaGame(pg, id, identity, { ...score, sportsHomeScore }, yes)
  expect(resolveMarketHelper).not.toHaveBeenCalled()
})
