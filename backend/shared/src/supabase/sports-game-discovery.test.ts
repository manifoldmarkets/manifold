jest.mock('shared/supabase/init', () => ({
  pgp: jest.requireActual('pg-promise')(),
  createSupabaseDirectClient: jest.fn(),
}))
jest.mock('shared/utils', () => ({
  log: Object.assign(jest.fn(), { error: jest.fn() }),
  isProd: () => true,
  getPrivateUsersNotSent: jest.fn(),
  contractUrl: (c: { id: string }) => 'https://example.invalid/' + c.id,
  contractColumnsToSelectWithPrefix: () => 'contracts.*',
}))
jest.mock('shared/send-email', () => ({
  sendTemplateEmail: jest.fn(),
  sendTextEmail: jest.fn(),
}))
jest.mock('shared/unsubscribe-links', () => ({
  getEmailNotificationDestinations: jest.fn(),
}))
jest.mock('shared/topic-interests', () => ({
  buildUserInterestsCache: jest.fn(),
  userIdsToAverageTopicConversionScores: { personalized: { groupA: 1 } },
}))

import { PGlite } from '@electric-sql/pglite'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import { isOfficialSportsGameMarket } from 'common/sports-discovery'
import type { PrivateUser, User } from 'common/user'
import { getPrivateUsersNotSent } from 'shared/utils'
import { userIdsToAverageTopicConversionScores } from 'shared/topic-interests'
import { getEmailNotificationDestinations } from 'shared/unsubscribe-links'
import { sendTemplateEmail, sendTextEmail } from 'shared/send-email'
import {
  sendBonusWithInterestingMarketsEmail,
  formatMoneyEmail,
} from '../emails'
import { createSupabaseDirectClient, pgp } from './init'
import { officialSportsGameSql } from './official-sports-game'
import { basicSearchSQL } from './search-contracts'
import {
  getForYouMarkets,
  sendWeeklyMarketsEmails,
} from '../weekly-markets-emails'

let db: PGlite
const house = MANIFOLD_SPORTS_USER_IDS[0]
type Game = Parameters<typeof isOfficialSportsGameMarket>[0]
const cases: [string, boolean, Game][] = []
for (const [kind, event] of [
  ['NBA game', 'bdl:nba:878'],
  ['women’s game', 'bdl:wnba:1'],
  ['college baseball', 'bdl:cbb:9'],
  ['FIFA match', 'bdl:fifa/worldcup:42'],
  ['MMA fight method', 'bdl:mma:817:23-34'],
  ['golf cut', 'bdl:lpga:115'],
  ['tennis match', 'bdl:atp:884:2-14'],
  ['women’s tennis', 'bdl:wta:224:1-45'],
  ['MMA fight', 'bdl:mma:91:1-21'],
  ['esports series', 'bdl:cs:98'],
  ['golf tournament', 'bdl:pga:18'],
  ['F1 session', 'bdl-f1:1:4'],
  ['bracket game', 'bdl:ncaab-bracket:2026:0:0'],
  ['legacy football match', 'fd-1234'],
  ['legacy Odds game', 'odds:americanfootball_nfl:abc123'],
])
  cases.push([kind, true, { sportsEventId: event }])
for (const kind of [
  'moneyline',
  'spread',
  'total',
  'prop',
  'winner',
  'podium',
  'method',
  'round',
  'distance',
  'top_n',
  'make_cut',
])
  cases.push([
    kind,
    true,
    {
      sportsEventId: 'bdl:mlb:39',
      sportsMarketType: kind,
      sportsProvider: 'bdl',
    },
  ])
cases.push(
  [
    'development sports creator',
    true,
    { creatorId: MANIFOLD_SPORTS_USER_IDS[1], sportsEventId: 'fd-1' },
  ],
  [
    'synthetic provider',
    false,
    { sportsProvider: 'fixture', sportsEventId: 'bdl:nba:10' },
  ],
  ['fixture namespace', false, { sportsEventId: 'fixture:nba:fake1' }],
  ['fixture marker', false, { sportsEventId: 'fd-10', sportsFixture: true }],
  [
    'community game',
    false,
    {
      sportsEventId: 'bdl:nba:88',
      sportsMarketType: 'moneyline',
      creatorId: 'community',
    },
  ],
  ['ordinary house post', false, {}],
  ['stale role on a post', false, { sportsMarketType: 'moneyline' }],
  [
    'season title',
    false,
    { sportsEventId: 'bdl-f1-title:2026:drivers', sportsMarketType: 'title' },
  ],
  ['NBA season future', false, { sportsEventId: 'bdl:nba-champion:2026' }],
  ['NBA playoff series', false, { sportsEventId: 'bdl:nba-series:2026:2-14' }],
  [
    'explicit independent role',
    false,
    { sportsEventId: 'bdl:nba:23', sportsMarketType: 'title' },
  ],
  [
    'unknown role',
    false,
    { sportsEventId: 'bdl:nba:23', sportsMarketType: 'blog' },
  ],
  [
    'unknown provider',
    false,
    { sportsEventId: 'bdl:nba:23', sportsProvider: 'unrecognized' },
  ],
  [
    'provider contradiction',
    false,
    { sportsEventId: 'fd-9', sportsProvider: 'odds' },
  ],
  ['unofficial namespace', false, { sportsEventId: 'bdl:unknown:12' }],
  ['partial legacy', false, { sportsEventId: 'odds:basketball_nba:' }],
  [
    'opaque provider flag',
    false,
    { sportsProvider: 'bdl', sportsEventId: 'unrelated' },
  ],
  ['missing entrants', false, { sportsEventId: 'bdl:atp:12' }],
  ['malformed session', false, { sportsEventId: 'bdl-f1:12:13:14' }],
  ['trailing control', false, { sportsEventId: 'fd-3\n' }],
  ['raw text prefix', false, { sportsEventId: 'not-bdl:nba:1' }]
)
const preferences = {
  blockedUserIds: [],
  blockedByUserIds: [],
  blockedGroupSlugs: [],
  blockedContractIds: [],
} as unknown as PrivateUser

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`create table contracts (
    id text primary key, creator_id text, data jsonb, token text default 'MANA', importance_score double precision,
    freshness_score double precision default 10, conversion_score double precision default 1, view_count int default 0,
    close_time timestamptz, resolution_time timestamptz, visibility text default 'public', deleted boolean default false,
    outcome_type text default 'BINARY', boosted boolean default false, group_slugs text[]
  );
  create table private_users (id text primary key,weekly_trending_email_sent boolean default false);
  create table group_contracts (group_id text,contract_id text);
  create table user_follows (user_id text,follow_id text);
  create table user_disinterests(user_id text, contract_id text);
  create table contract_bets(contract_id text,user_id text);
  create table contract_perp_events(contract_id text,user_id text,event_type text);
  `)
  type Row = Record<string, unknown>
  const query = async (sql: string, params?: unknown[]) =>
    (await db.query<Row>(pgp.as.format(sql, params))).rows
  const pg = {
    map: async (sql: string, params: unknown[], fn: (row: Row) => unknown) =>
      (await query(sql, params)).map(fn),
    none: async (sql: string, params: unknown[]) => {
      await query(sql, params)
    },
    one: async (sql: string, params: unknown[], fn: (row: Row) => unknown) => {
      const rows = await query(sql, params)
      if (rows.length !== 1) throw Error('Expected one synthetic row')
      return fn(rows[0])
    },
  }
  jest
    .mocked(createSupabaseDirectClient)
    .mockReturnValue(
      pg as unknown as ReturnType<typeof createSupabaseDirectClient>
    )
})
afterAll(async () => db.close())

it.each(cases)(
  'recognizes %s identically in TypeScript and SQL',
  async (_label, expected, props) => {
    const contract = { creatorId: house, ...props }
    const { rows } = await db.query<{ official: boolean }>(
      `select ${officialSportsGameSql('c')} as official
    from (select $1::text as creator_id,$2::jsonb as data) as c`,
      [contract.creatorId, JSON.stringify(props)]
    )
    expect(rows).toEqual([{ official: expected }])
    expect(isOfficialSportsGameMarket(contract)).toBe(expected)
  }
)

describe('interesting-market selection for the weekly and onboarding templates', () => {
  beforeAll(async () => {
    await db.query(
      `insert into contracts(id,creator_id,data,importance_score)
     select 'game'||i,$1,jsonb_build_object('id','game'||i,'creatorId',$1::text,'sportsEventId','bdl:nba:'||i),1000+i
     from generate_series(1,205) as i`,
      [house]
    )
    await db.query(`insert into contracts(id,creator_id,data,importance_score)
     select 'community'||i,'member',jsonb_build_object('id','community'||i,'creatorId','member','sportsEventId','fd-42'),100-i
     from generate_series(1,7) as i`)
    await db.exec(`insert into contracts(id,creator_id,data,importance_score)
       values ('dismissed','member','{"id":"dismissed","creatorId":"member"}',999);
       insert into user_disinterests(user_id, contract_id) values ('personalized','dismissed');
       insert into group_contracts select 'groupA',id from contracts;`)
  })
  it.each(['cold', 'personalized'])(
    'fills the six %s email slots below a game-heavy score cutoff',
    async (userId) => {
      const result = await getForYouMarkets(userId, 6, preferences)
      expect(result.slice(0, 6).map((c) => c.id)).toEqual(
        (userId === 'cold' ? ['dismissed'] : [])
          .concat([
            'community1',
            'community2',
            'community3',
            'community4',
            'community5',
            'community6',
          ])
          .slice(0, 6)
      )
    }
  )
  it('preserves ordinary basic search results for a dismissed market', async () => {
    const sql = basicSearchSQL({
      uid: 'personalized',
      sort: 'score',
      filter: 'open',
      contractType: 'ALL',
      token: 'ALL',
      limit: 1,
      offset: 0,
      excludeOfficialSports: true,
      privateUser: preferences,
    })
    const { rows } = await db.query<{ id: string }>(sql)
    expect(rows.map((r) => r.id)).toEqual(['dismissed'])
  })
  const recipient = {
    ...preferences,
    id: 'personalized',
    name: 'Test User',
    createdTime: 1,
    weeklyTraders: 0,
    currentBettingStreak: 0,
    email: 'recipient@example.invalid',
  }
  const subscriber = {
    sendToEmail: true,
    sendToBrowser: false,
    sendToMobile: false,
    urlToManageThisNotification: 'https://example.invalid/preferences',
    unsubscribeUrl: 'https://example.invalid/unsubscribe',
  }
  beforeEach(async () => {
    userIdsToAverageTopicConversionScores.personalized = { groupA: 1 }
    jest.clearAllMocks()
    jest.mocked(getEmailNotificationDestinations).mockReturnValue(subscriber)
    jest.mocked(getPrivateUsersNotSent).mockResolvedValue([recipient])
    await db.exec(
      "truncate private_users; insert into private_users(id) values ('personalized')"
    )
  })
  it.each([true, false])(
    'records actual weekly handoff success (%s) for a complete email',
    async (accepted) => {
      jest
        .mocked(sendTemplateEmail)
        .mockResolvedValueOnce(
          accepted ? { id: 'mock-accepted', message: 'Queued' } : null
        )
      await sendWeeklyMarketsEmails()
      expect(sendTemplateEmail).toHaveBeenCalledWith(
        recipient.email,
        expect.any(String),
        'interesting-markets',
        expect.objectContaining({
          question1Link: 'https://example.invalid/community1',
          question6Link: 'https://example.invalid/community6',
        })
      )
      expect(
        (await db.query('select weekly_trending_email_sent from private_users'))
          .rows
      ).toEqual([{ weekly_trending_email_sent: accepted }])
    }
  )
  it('keeps a sparse weekly recipient eligible and the onboarding bonus confirmation well formed', async () => {
    await db.exec(
      "delete from contracts where id in ('community6','community7')"
    )
    const recommendations = await getForYouMarkets('personalized', 6, recipient)
    expect(recommendations.map((c) => c.id)).toEqual([
      'community1',
      'community2',
      'community3',
      'community4',
      'community5',
    ])
    await sendWeeklyMarketsEmails()
    expect(
      (await db.query('select weekly_trending_email_sent from private_users'))
        .rows
    ).toEqual([{ weekly_trending_email_sent: false }])
    expect(sendTemplateEmail).not.toHaveBeenCalled()
    expect(sendTextEmail).not.toHaveBeenCalled()
    await sendBonusWithInterestingMarketsEmail(
      { name: 'Test User' } as User,
      recipient,
      recommendations,
      50
    )
    expect(sendTextEmail).toHaveBeenCalledTimes(1)
    expect(sendTextEmail).toHaveBeenCalledWith(
      recipient.email,
      'Your Manifold signup bonus',
      expect.stringContaining(
        'We added ' + formatMoneyEmail(50) + ' to your balance.'
      )
    )
    expect(jest.mocked(sendTextEmail).mock.calls[0][2]).toContain(
      subscriber.unsubscribeUrl
    )
    jest
      .mocked(getEmailNotificationDestinations)
      .mockReturnValue({ ...subscriber, sendToEmail: false })
    await sendBonusWithInterestingMarketsEmail(
      { name: 'Test User' } as User,
      recipient,
      [],
      50
    )
    expect(sendTextEmail).toHaveBeenCalledTimes(1)
  })
})
