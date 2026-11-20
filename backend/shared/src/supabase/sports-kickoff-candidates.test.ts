import { PGlite } from '@electric-sql/pglite'
import { Contract } from 'common/contract'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import { isKickoffLiquidityCandidate } from 'common/sports-kickoff-interface'
import { kickoffLiquidityCandidatesSql } from './sports-kickoff-candidates'

jest.mock('./init', () => ({ pgp: jest.requireActual('pg-promise')() }))

const start = '2026-10-01T00:00:00Z'
const answer = (
  text: string | null,
  isOther = false,
  resolution: string | null = null
) => ({ text, isOther, resolution })
const pair = [answer('Home'), answer('Away')]
const base = {
  creatorId: MANIFOLD_SPORTS_USER_IDS[0],
  token: 'MANA',
  mechanism: 'cpmm-multi-2',
  outcomeType: 'MULTIPLE_CHOICE',
  shouldAnswersSumToOne: true,
  addAnswersMode: 'DISABLED',
  isResolved: false,
  resolution: null as string | null,
  deleted: false,
  sportsMarketType: 'moneyline',
  sportsStartTimestamp: start,
  sportsStartKnown: true as boolean | undefined,
  sportsProvider: 'bdl' as string | undefined,
  sportsEventId: 'bdl:nba:1',
  sportsFixture: false,
  closeTime: Date.parse(start) + 1000,
  answers: pair,
}
type Change = Partial<typeof base>
const cases: [string, boolean, Change][] = [
  ['two-way', true, {}],
  ['three-way', true, { answers: [...pair, answer('Draw')] }],
  ['offset', true, { sportsStartTimestamp: '2026-10-01T09:30:00.000+09:30' }],
  [
    'old odds exact kickoff',
    true,
    {
      sportsProvider: undefined,
      sportsEventId: 'odds:one',
      sportsStartKnown: undefined,
    },
  ],
  [
    'old odds unknown time',
    false,
    {
      sportsProvider: undefined,
      sportsEventId: 'odds:one',
      sportsStartKnown: false,
    },
  ],
  [
    'new odds missing start flag',
    false,
    {
      sportsProvider: 'odds',
      sportsEventId: 'odds:one',
      sportsStartKnown: undefined,
    },
  ],
  [
    'BDL missing start flag',
    false,
    { sportsProvider: undefined, sportsStartKnown: undefined },
  ],
  ['placeholder', false, { sportsStartKnown: false }],
  [
    'not a sports ID',
    false,
    { sportsProvider: undefined, sportsEventId: 'ordinary' },
  ],
  ['fixture provider', false, { sportsProvider: 'fixture' }],
  ['fixture ID', false, { sportsEventId: 'fixture:nba:1' }],
  ['fixture flag', false, { sportsFixture: true }],
  ['non-house creator', false, { creatorId: 'community' }],
  ['other token', false, { token: 'CASH' }],
  ['earlier mechanism', false, { mechanism: ['cpmm', 'multi', '1'].join('-') }],
  ['different outcome', false, { outcomeType: 'NUMBER' }],
  ['independent pools', false, { shouldAnswersSumToOne: false }],
  ['deleted', false, { deleted: true }],
  ['resolved flag', false, { isResolved: true }],
  ['resolution result', false, { resolution: 'CANCEL' }],
  ['open answers', false, { addAnswersMode: 'ANYONE' }],
  ['spread', false, { sportsMarketType: 'spread' }],
  ['field', false, { sportsMarketType: 'winner' }],
  ['equal kickoff and close', false, { closeTime: Date.parse(start) }],
  ['date only', false, { sportsStartTimestamp: '2026-10-01' }],
  ['missing timezone', false, { sportsStartTimestamp: '2026-10-01T00:00:00' }],
  ['unknown time', false, { sportsStartTimestamp: 'unknown' }],
  ['invalid date', false, { sportsStartTimestamp: '2026-02-30T00:00:00Z' }],
  [
    'timezone-independent close',
    true,
    {
      sportsStartTimestamp: '1800-01-01T00:00:00Z',
      closeTime: Date.parse('1800-01-01T00:00:00.001Z'),
    },
  ],
  ['month zero', false, { sportsStartTimestamp: '2026-00-10T00:00:00Z' }],
  ['day zero', false, { sportsStartTimestamp: '2026-02-00T00:00:00Z' }],
  ['null answer label', false, { answers: [answer(null), pair[1]] }],
  ['blank answer label', false, { answers: [answer(' \t\n'), pair[1]] }],
  [
    'Other with varied whitespace',
    false,
    { answers: [answer('\t\u00a0oThEr\n\ufeff'), pair[1]] },
  ],
  ['one answer', false, { answers: pair.slice(0, 1) }],
  ['four answers', false, { answers: [...pair, ...pair] }],
  ['built-in Other', false, { answers: [answer('Field', true), pair[0]] }],
  ['named Other', false, { answers: [answer(' Other '), pair[0]] }],
  [
    'resolved answer',
    false,
    { answers: [answer('Runner', false, 'NO'), pair[0]] },
  ],
]

it('selects exactly the eligible moneylines in memory and in PostgreSQL', async () => {
  const db = new PGlite()
  try {
    await db.exec("set timezone='America/New_York'")
    await db.exec(
      'create temp table contracts (id text primary key, data jsonb, creator_id text, token text, mechanism text, outcome_type text, close_time timestamptz, deleted boolean, resolution text); create temp table answers (contract_id text, text text, is_other boolean, resolution text)'
    )
    for (const [id, expected, change] of cases) {
      const c = { ...base, ...change }
      expect({
        [id]: isKickoffLiquidityCandidate(c as unknown as Contract),
      }).toEqual({ [id]: expected })
      await db.query(
        'insert into contracts values ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [
          id,
          JSON.stringify(c),
          c.creatorId,
          c.token,
          c.mechanism,
          c.outcomeType,
          new Date(c.closeTime).toISOString(),
          c.deleted,
          c.resolution,
        ]
      )
      for (const a of c.answers)
        await db.query('insert into answers values ($1,$2,$3,$4)', [
          id,
          a.text,
          a.isOther,
          a.resolution,
        ])
    }
    const { rows } = await db.query<{ id: string }>(
      kickoffLiquidityCandidatesSql()
    )
    expect(rows.map((r) => r.id).sort()).toEqual(
      cases
        .filter((c) => c[1])
        .map((c) => c[0])
        .sort()
    )
  } finally {
    await db.close()
  }
}, 30000)
