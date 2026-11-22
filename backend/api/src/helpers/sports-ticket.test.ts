import { toUfcMarketBout, ufcTicketBinding } from 'common/bdl/ufc-card'
import type { Answer } from 'common/answer'
import type { Contract } from 'common/contract'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import {
  sportsTicketBinding,
  toOfficialGame,
} from 'common/sports-official-game'
import type { SupabaseTransaction } from 'shared/supabase/init'
import { lockContractAndGetBetData } from './bets'

jest.mock('api/redeem-shares', () => ({}))
jest.mock('shared/supabase/init', () => ({
  pgp: { as: { format: (sql: string) => sql } },
}))
jest.mock('shared/helpers/user-contract-metrics', () => ({}))
jest.mock('shared/monitoring/log', () => ({}))
jest.mock('shared/supabase/utils', () => ({}))
jest.mock('shared/txn/run-txn', () => ({}))
jest.mock('shared/utils', () => ({ contractColumnsToSelect: 'data,token' }))

const now = Date.UTC(2026, 10, 22, 15)
const market = {
  id: 'local',
  creatorId: MANIFOLD_SPORTS_USER_IDS[0],
  visibility: 'public',
  token: 'MANA',
  sportsEventId: 'bdl:nba:72',
  sportsLeagueKey: 'nba',
  sportsProvider: 'bdl',
  sportsMarketType: 'moneyline',
  sportsHomeTeam: 'Home',
  sportsAwayTeam: 'Away',
  sportsHomeTeamId: '1',
  sportsAwayTeamId: '2',
  sportsStartTimestamp: new Date(now - 1000).toISOString(),
  closeTime: now + 3600000,
  mechanism: 'cpmm-multi-2',
  outcomeType: 'MULTIPLE_CHOICE',
  addAnswersMode: 'DISABLED',
  shouldAnswersSumToOne: true,
  answers: [],
  isResolved: false,
}
const rows = [
  { id: 'a', index: 0, contract_id: 'local', text: 'Away', prob: 0.4 },
  { id: 'h', index: 1, contract_id: 'local', text: 'Home', prob: 0.6 },
]
const answers: Answer[] = rows.map((a) => ({
  ...a,
  contractId: a.contract_id,
  userId: market.creatorId,
  createdTime: now - 1000,
  poolYes: 100,
  poolNo: 100,
  p: 0.5,
  totalLiquidity: 100,
  subsidyPool: 0,
  volume: 0,
  probChanges: { day: 0, week: 0, month: 0 },
}))
const game = toOfficialGame(
  market as unknown as Contract,
  answers,
  [],
  undefined,
  now
)!
const ticket = { binding: sportsTicketBinding(game), closeTime: game.closeTime }
const body = {
  contractId: 'local',
  outcome: 'YES' as const,
  answerId: 'h',
  sportsTicket: ticket,
}
const initial = process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED
beforeEach(() => {
  process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED = 'true'
  jest.spyOn(Date, 'now').mockReturnValue(now)
})
afterEach(() => {
  jest.restoreAllMocks()
  if (initial === undefined) delete process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED
  else process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED = initial
})
function transaction(
  patch: Record<string, unknown> = {},
  offered: Record<string, unknown>[] = rows
) {
  const multi = jest.fn(async () => [
    [{ data: { ...market, ...patch }, token: 'MANA' }],
    offered,
    [],
  ])
  return { pg: { multi } as unknown as SupabaseTransaction, multi }
}

it('checks both the locked contract and payable answer rows before a Sports buy', async () => {
  const valid = transaction({ sportsLiveStatus: 'SUSPENDED' })
  await expect(
    lockContractAndGetBetData(valid.pg, body, 'buyer')
  ).resolves.toHaveProperty('contract.id', 'local')
  expect(valid.multi).toHaveBeenCalledWith(
    expect.stringMatching(
      /for update;[\s\S]*from answers[\s\S]*order by index for share;/
    )
  )
  for (const patch of [
    { sportsEventId: 'bdl:nba:73' },
    { sportsAwayTeamId: '88' },
    { sportsLiveStatus: 'FINAL' },
    { sportsLiveStatus: 'CANCELED' },
    { closeTime: now },
    { shouldAnswersSumToOne: false },
    { addAnswersMode: 'ANYONE' },
    { visibility: 'unlisted' },
    { creatorId: 'someone' },
  ]) {
    await expect(
      lockContractAndGetBetData(transaction(patch).pg, body, 'buyer')
    ).rejects.toMatchObject({ code: 409 })
  }
  for (const patch of [
    { id: 'other' },
    { contract_id: 'other' },
    { text: 'different' },
    { resolution: 'NO' },
  ])
    await expect(
      lockContractAndGetBetData(
        transaction({}, [rows[0], { ...rows[1], ...patch }]).pg,
        body,
        'buyer'
      )
    ).rejects.toMatchObject({ code: 409 })
  for (const answerId of [undefined, 'foreign'])
    await expect(
      lockContractAndGetBetData(
        transaction().pg,
        { ...body, answerId },
        'buyer'
      )
    ).rejects.toMatchObject({ code: 409 })
  await expect(
    lockContractAndGetBetData(
      transaction().pg,
      { ...body, sportsTicket: { ...ticket, closeTime: now } },
      'buyer'
    )
  ).rejects.toMatchObject({ code: 409 })
})

it('fails a bound order closed on a disabled worker and preserves ordinary native orders', async () => {
  process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED = 'false'
  await expect(
    lockContractAndGetBetData(transaction().pg, body, 'buyer')
  ).rejects.toMatchObject({ code: 409 })
  for (const enabled of ['false', 'true']) {
    process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED = enabled
    const regular = transaction({ sportsLiveStatus: 'CANCELED' })
    await expect(
      lockContractAndGetBetData(
        regular.pg,
        { ...body, sportsTicket: undefined },
        'buyer'
      )
    ).resolves.toHaveProperty('contract.id', 'local')
    expect(regular.multi).toHaveBeenCalledWith(
      expect.not.stringContaining('for share')
    )
  }
})

it('rechecks the three-way UFC event, every answer binding, receipt and promised cutoff against the locked rows', async () => {
  const event = 'bdl:mma:77:10-20'
  const snapshot = {
    observedEventId: event,
    cardId: 7,
    cardName: 'Fight night',
    cardDate: '2026-11-22',
    segment: 'main_card',
    segmentStart: now - 3000,
    order: 1,
    headline: true,
    titleFight: false,
    status: 'in_progress',
    observedAt: now - 100,
    lastNonfinalAt: now - 100,
    firstFinalAt: null,
    winner: null,
    method: null,
    round: null,
    roundTime: null,
    scheduledRounds: 3,
    onlyRemaining: false,
  }
  const fight = {
    ...market,
    sportsLeagueKey: 'mma',
    sportsEventId: event,
    sportsEntrantIds: [20, 10, null],
    sportsUfc: snapshot,
  }
  const offered = [
    { ...rows[1], index: 0 },
    { ...rows[0], index: 1 },
    { ...rows[0], id: 'd', index: 2, text: 'Draw or no contest' },
  ]
  const current = toUfcMarketBout(
    fight as unknown as Contract,
    offered.map((a) => ({ ...a, contractId: 'local' })) as unknown as Answer[]
  )!
  const selection = {
    ...body,
    sportsTicket: { binding: ufcTicketBinding(current), closeTime: now + 1000 },
    answerId: 'd',
  }
  for (const answerId of ['a', 'h', 'd']) {
    await expect(
      lockContractAndGetBetData(
        transaction(fight, offered).pg,
        { ...selection, answerId },
        'buyer'
      )
    ).resolves.toHaveProperty('contract.id', 'local')
  }
  for (const [patch, native] of [
    [{ sportsUfc: { ...snapshot, observedAt: now + 1 } }, offered],
    [
      {
        sportsUfc: {
          ...snapshot,
          observedAt: now - 3600000,
          lastNonfinalAt: now - 3600000,
        },
      },
      offered,
    ],
    [
      { sportsUfc: { ...snapshot, observedEventId: 'bdl:mma:77:20-30' } },
      offered,
    ],
    [{ sportsUfc: { ...snapshot, status: 'final' } }, offered],
    [{ closeTime: now }, offered],
    [{ visibility: 'private' }, offered],
    [{}, offered.slice(0, 2)],
    [{}, [{ ...offered[0], id: 'replacement' }, ...offered.slice(1)]],
    [{}, [{ ...offered[0], text: 'Another' }, ...offered.slice(1)]],
  ] as const) {
    await expect(
      lockContractAndGetBetData(
        transaction({ ...fight, ...patch }, [...native]).pg,
        selection,
        'buyer'
      )
    ).rejects.toMatchObject({ code: 409 })
  }
  await expect(
    lockContractAndGetBetData(
      transaction(fight, offered).pg,
      {
        ...selection,
        sportsTicket: { ...selection.sportsTicket, closeTime: now },
      },
      'buyer'
    )
  ).rejects.toMatchObject({ code: 409 })
})
