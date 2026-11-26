jest.mock('shared/websockets/helpers', () => ({
  broadcastUpdatedPrivateUser: jest.fn(),
}))
jest.mock('api/follow-user', () => ({ followUserInternal: jest.fn() }))
jest.mock('shared/utils', () => ({
  ...jest.requireActual('shared/utils'),
  getUser: jest.fn(),
}))
jest.mock('shared/supabase/init', () => {
  const actual = jest.requireActual('shared/supabase/init')
  return { ...actual, createSupabaseDirectClient: jest.fn() }
})

import { PGlite } from '@electric-sql/pglite'
import { API } from 'common/api/schema'
import { createSupabaseDirectClient, pgp } from 'shared/supabase/init'
import { getUser } from 'shared/utils'
import {
  bulkInsert,
  bulkUpdate,
  bulkUpdateData,
  bulkUpdateQuery,
  bulkUpsert,
  FieldVal,
  insert,
  update,
  updateDataQuery,
} from './utils'
import { limit as limitSql, renderSql, select } from './sql-builder'
import { incrementBalance } from './users'
import { getContractPrivacyWhereSQLFilter } from './contracts'
import { getFollowedReposts } from './reposts'
import {
  basicSearchSQL,
  getForYouSQL,
  getSemanticSearchContractSQL,
  privateUserBlocksSql,
} from './search-contracts'
import { userIdsToAverageTopicConversionScores } from 'shared/topic-interests'
import { getBulkUpdateLimitOrdersQueryAndValues } from 'api/helpers/bets'
import { blockUser, unblockUser } from 'api/block-user'
import { unblockMarket } from 'api/block-market'
import { unblockGroup } from 'api/block-group'
import { updateNotifSettings } from 'api/update-notif-settings'

// Strips quoted literals ('...' with '' escapes) and quoted identifiers, so
// whatever is left is the statement structure the server will parse.
const structureOf = (sql: string) =>
  sql.replace(/'(?:[^']|'')*'/g, "''").replace(/"(?:[^"]|"")*"/g, '""')

const expectSingleStatement = (sql: string) => {
  const structure = structureOf(sql)
  expect(structure).not.toMatch(/;/)
  expect(structure).not.toMatch(/--/)
  expect(structure).not.toMatch(/\/\*/)
}

const HOSTILE = [
  `x' returning *; select 1; --`,
  `x}'::text[]) where false; select 1; --`,
  `x'); select 1; --`,
  `$1`,
  `$1:raw`,
  `\${a}`,
  `a,b}`,
  `"quoted"`,
  `back\\slash`,
]

describe('updateDataQuery', () => {
  it.each(HOSTILE)('keeps a hostile id inside a literal: %s', (id) => {
    const sql = updateDataQuery('private_users', 'id', {
      id,
      blockedByUserIds: FieldVal.arrayConcat('u1'),
    })
    expectSingleStatement(sql)
    expect(sql).toContain(`where id = ${pgp.as.text(id)} returning *`)
  })

  it('does not re-format values already inside FieldVal fragments', () => {
    // basic data with a quote plus a fragment value that looks like a
    // pg-promise variable: the variable must stay literal text.
    const sql = updateDataQuery('private_users', 'id', {
      id: 'u1',
      email: "o'brien@example.com",
      blockedContractIds: FieldVal.arrayConcat('$3:raw', '$1'),
    } as any)
    expectSingleStatement(sql)
    expect(sql).toContain('["$3:raw","$1"]')
    expect(sql).toContain(`'{"email":"o''brien@example.com"}'`)
  })

  it('keeps plain identifiers unquoted and escapes others', () => {
    const sql = updateDataQuery('contracts', 'id', { id: 'c1', question: 'q' })
    expect(sql).toMatch(/^update contracts set data = data/)
    expect(sql).toContain(`where id = 'c1' returning *`)
    const odd = updateDataQuery(
      'contracts' as any,
      'a"b' as any,
      {
        'a"b': 'c1',
      } as any
    )
    expect(odd).toContain(`where "a""b" = 'c1' returning *`)
    expectSingleStatement(odd)
  })

  it('applies deletes before merges', () => {
    const sql = updateDataQuery('private_users', 'id', {
      id: 'u1',
      blockedUserIds: FieldVal.arrayConcat('u2'),
      pushToken: FieldVal.delete(),
    })
    expect(sql.indexOf(`- 'pushToken'`)).toBeLessThan(
      sql.indexOf('blockedUserIds')
    )
  })
})

describe('FieldVal', () => {
  it.each(HOSTILE)('arrayRemove keeps values as array elements: %s', (v) => {
    const sql = updateDataQuery('private_users', 'id', {
      id: 'u1',
      blockedContractIds: FieldVal.arrayRemove(v),
    })
    expectSingleStatement(sql)
    expect(sql).toContain(`- array[${pgp.as.text(v)}]::text[]`)
  })

  it('arrayRemove handles several values and none', () => {
    expect(FieldVal.arrayRemove('a', 'b')('f')).toContain(
      `- array['a','b']::text[]`
    )
    expect(FieldVal.arrayRemove()('f')).toContain(`- '{}'::text[]`)
  })

  it('increment renders a numeric parameter', () => {
    expect(FieldVal.increment(5)('totalLiquidity')).toBe(
      `|| jsonb_build_object('totalLiquidity', (data->'totalLiquidity')::numeric + 5)`
    )
    expect(FieldVal.increment(-2.5)('bountyLeft')).toContain('+ -2.5')
  })

  it.each([NaN, Infinity, -Infinity, '1; select 1' as any])(
    'increment rejects %s',
    (n) => {
      expect(() => FieldVal.increment(n)).toThrow()
    }
  )

  it('quotes field names', () => {
    expect(FieldVal.delete()(`a'b`)).toBe(`- 'a''b'`)
    expectSingleStatement(FieldVal.increment(1)(`a'); select 1; --`))
  })
})

describe('route id validation', () => {
  const routes = [
    ['user/by-id/:id/block', 'id'],
    ['user/by-id/:id/unblock', 'id'],
    ['market/:contractId/block', 'contractId'],
    ['market/:contractId/unblock', 'contractId'],
  ] as const

  it.each(routes)('%s accepts real ids', (route, field) => {
    const props = API[route].props
    expect(
      props.safeParse({ [field]: 'TmnWR9E6lAYtlJa9lvXdwP47rPR2' }).success
    ).toBe(true)
    expect(props.safeParse({ [field]: 'aB3_x-9Qz' }).success).toBe(true)
  })

  it.each(routes)('%s rejects non-id strings', (route, field) => {
    const props = API[route].props
    for (const v of ['', `x'`, 'a b', 'a;b', 'a/b', '$1']) {
      expect(props.safeParse({ [field]: v }).success).toBe(false)
    }
  })
})

// The handlers below run against PGlite with pg-promise formatting, as in
// production. exec() uses the simple query protocol, which (like production)
// would run a second statement if one were smuggled into the text; the canary
// table is what such a statement would drop.
describe('handlers against Postgres', () => {
  type Handler = (props: any, auth: { uid: string }) => Promise<unknown>
  let db: PGlite
  let queries: string[]

  const run = async (sql: string, values?: unknown) => {
    const text = values === undefined ? sql : pgp.as.format(sql, values)
    queries.push(text)
    const results = await db.exec(text)
    return results[results.length - 1]?.rows ?? []
  }
  const client: any = {
    one: async (sql: string, values?: unknown) => {
      const rows = await run(sql, values)
      if (rows.length !== 1) throw new Error(`expected 1 row: ${sql}`)
      return rows[0]
    },
    oneOrNone: async (sql: string, values?: unknown) =>
      (await run(sql, values))[0] ?? null,
    none: async (sql: string, values?: unknown) => {
      await run(sql, values)
    },
    tx: async (f: (tx: unknown) => Promise<unknown>) => f(client),
  }
  const dataOf = async (id: string) =>
    (
      await db.query<{ data: any }>(
        'select data from private_users where id = $1',
        [id]
      )
    ).rows[0]?.data
  const canaryExists = async () =>
    (await db.query(`select to_regclass('canary') as t`)).rows[0] as any

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(
      `create table private_users (id text primary key, data jsonb not null)`
    )
  })
  afterAll(async () => {
    await db.close()
  })

  beforeEach(async () => {
    queries = []
    await db.exec(
      `truncate private_users; create table if not exists canary ()`
    )
    for (const id of ['me', 'target', ...HOSTILE]) {
      await db.query(`insert into private_users values ($1, $2)`, [
        id,
        { id, blockedUserIds: [], blockedByUserIds: [] },
      ])
    }
    jest.mocked(createSupabaseDirectClient).mockReturnValue(client)
    jest.mocked(getUser).mockResolvedValue({ id: 'target' } as any)
  })

  afterEach(async () => {
    expect((await canaryExists()).t).toBe('canary')
    queries.forEach(expectSingleStatement)
  })

  it.each(HOSTILE)('block then unblock user %s', async (v) => {
    await (blockUser as Handler)({ id: v }, { uid: 'me' })
    expect((await dataOf('me')).blockedUserIds).toEqual([v])
    expect((await dataOf(v)).blockedByUserIds).toEqual(['me'])

    await (unblockUser as Handler)({ id: v }, { uid: 'me' })
    expect((await dataOf('me')).blockedUserIds).toEqual([])
    expect((await dataOf(v)).blockedByUserIds).toEqual([])
    expect((await dataOf('target')).blockedByUserIds).toEqual([])
  })

  it.each(HOSTILE)('unblock market and group %s', async (v) => {
    await db.query(`update private_users set data = $1 where id = 'me'`, [
      {
        blockedContractIds: ['a', v, 'b,c'],
        blockedGroupSlugs: ['{x}', v],
      },
    ])
    await (unblockMarket as Handler)({ contractId: v }, { uid: 'me' })
    await (unblockGroup as Handler)({ slug: v }, { uid: 'me' })
    const data = await dataOf('me')
    expect(data.blockedContractIds).toEqual(['a', 'b,c'])
    expect(data.blockedGroupSlugs).toEqual(['{x}'])
  })

  it('FieldVal operations keep their meaning', async () => {
    await db.query(`update private_users set data = $1 where id = 'me'`, [
      { n: 10, gone: true, list: ['a', 'b', 'c'] },
    ])
    await client.one(
      updateDataQuery('private_users', 'id', {
        id: 'me',
        n: FieldVal.increment(-2.5),
        gone: FieldVal.delete(),
        list: FieldVal.arrayRemove('a', 'c'),
        added: FieldVal.arrayConcat('x', "y'z"),
        plain: "it's",
      } as any)
    )
    expect(await dataOf('me')).toEqual({
      n: 7.5,
      list: ['b'],
      added: ['x', "y'z"],
      plain: "it's",
    })
  })

  it('blockUser 404s for a user that does not exist', async () => {
    jest.mocked(getUser).mockResolvedValue(null)
    await expect(
      (blockUser as Handler)({ id: 'nobody' }, { uid: 'me' })
    ).rejects.toMatchObject({ code: 404 })
    expect(queries).toEqual([])
  })

  it('update-notif-settings rejects unknown preference types', async () => {
    for (const type of HOSTILE.concat(['not_a_preference', '__proto__'])) {
      await expect(
        (updateNotifSettings as Handler)(
          { type, medium: 'email', enabled: true },
          { uid: 'me' }
        )
      ).rejects.toMatchObject({ code: 400 })
    }
    expect(queries).toEqual([])
  })

  it('update-notif-settings writes the preference', async () => {
    await db.query(`update private_users set data = $1 where id = 'me'`, [
      { notificationPreferences: { trending_markets: ['email'] } },
    ])
    await (updateNotifSettings as Handler)(
      { type: 'trending_markets', medium: 'browser', enabled: true },
      { uid: 'me' }
    )
    expect(
      (await dataOf('me')).notificationPreferences.trending_markets
    ).toEqual(['email', 'browser'])
  })
})

// pg-promise variable syntax outside a quoted literal: anything left after
// rendering would be substituted by a later format.
const expectNoUnboundPlaceholders = (sql: string) => {
  expect(structureOf(sql)).not.toMatch(/\$(\d|\{|\(|<|\[|\/)/)
}

describe('write helpers against Postgres', () => {
  let db: PGlite
  const run = async (sql: string) => {
    expectSingleStatement(sql)
    const results = await db.exec(sql)
    return results[results.length - 1]?.rows ?? []
  }
  // pg-promise formats values client-side, as in production.
  const fmt = (sql: string, values?: unknown) =>
    values === undefined ? sql : pgp.as.format(sql, values)
  const pg: any = {
    one: async (sql: string, values?: unknown) => {
      const rows = await run(fmt(sql, values))
      if (rows.length !== 1) throw new Error(`expected 1 row: ${sql}`)
      return rows[0]
    },
    many: async (sql: string, values?: unknown) => run(fmt(sql, values)),
    none: async (sql: string, values?: unknown) => {
      await run(fmt(sql, values))
    },
  }
  const all = async () =>
    (
      await db.query<any>(
        `select id, k, label, n, at::text as at, data from things order by id, k`
      )
    ).rows

  beforeAll(async () => {
    db = new PGlite()
  })
  afterAll(async () => {
    await db.close()
  })
  beforeEach(async () => {
    await db.exec(`
      drop table if exists things;
      create table things (
        id text not null, k integer not null, label text, n numeric,
        at timestamptz, data jsonb, primary key (id, k));
      create table if not exists canary ();
    `)
  })
  afterEach(async () => {
    expect(
      ((await db.query(`select to_regclass('canary') as t`)).rows[0] as any).t
    ).toBe('canary')
  })

  const row = (id: string, label: string) => ({
    id,
    k: 1,
    label,
    n: 1.5,
    at: '2026-01-02T03:04:05.000Z',
    data: JSON.stringify({ label }),
  })

  it.each(HOSTILE.concat([`x::jsonb'`, `y::text`]))(
    'insert, update, bulk update and upsert keep %s as data',
    async (v) => {
      await insert(pg, 'things' as any, row(v, v) as any)
      await bulkInsert(pg, 'things' as any, [row('b', v), row('c', v)] as any)
      await update(
        pg,
        'things' as any,
        'id' as any,
        {
          id: v,
          label: v,
          n: 2,
        } as any
      )
      await bulkUpdate(
        pg,
        'things' as any,
        ['id', 'k'] as any,
        [
          {
            id: 'b',
            k: 1,
            label: `${v}!`,
            at: '2026-05-05T00:00:00Z',
            data: JSON.stringify({ v }),
          },
          {
            id: 'c',
            k: 1,
            label: `${v}?`,
            at: '2026-05-06T00:00:00Z',
            data: JSON.stringify({ v: `${v}?` }),
          },
        ] as any
      )
      await bulkUpsert(
        pg,
        'things' as any,
        ['id', 'k'] as any,
        [row('d', v)] as any
      )
      await bulkUpdateData(pg, 'things' as any, [{ id: 'd', label: v } as any])

      const rows = await all()
      expect(rows.map((r: any) => r.id).sort()).toEqual(
        [v, 'b', 'c', 'd'].sort()
      )
      const byId = Object.fromEntries(rows.map((r: any) => [r.id, r]))
      expect(byId[v]).toMatchObject({ label: v, data: { label: v } })
      expect(Number(byId[v].n)).toBe(2)
      expect(byId['b']).toMatchObject({ label: `${v}!`, data: { v } })
      expect(byId['c'].label).toBe(`${v}?`)
      expect(byId['c'].at).toMatch(/^2026-05-06/)
      expect(byId['d'].data).toEqual({ label: v, id: 'd' })
    }
  )

  it('bulk update types columns from the table, not the literals', async () => {
    await bulkInsert(pg, 'things' as any, [row('a', 'x')] as any)
    await bulkUpdate(
      pg,
      'things' as any,
      ['id', 'k'] as any,
      [
        {
          id: 'a',
          k: 1,
          n: 3,
          at: '2026-07-08T09:10:11Z',
          data: JSON.stringify({ nested: { ok: true } }),
        },
      ] as any
    )
    const [a] = await all()
    expect(Number(a.n)).toBe(3)
    expect(a.at).toMatch(/^2026-07-08 09:10:11/)
    expect(a.data).toEqual({ nested: { ok: true } })
  })

  it('limit order bulk update keeps values as data', async () => {
    await db.exec(
      `create table if not exists contract_bets (bet_id text primary key, data jsonb)`
    )
    for (const v of HOSTILE) {
      await db.query(`insert into contract_bets values ($1, '{}')`, [v])
    }
    const { query } = getBulkUpdateLimitOrdersQueryAndValues(
      HOSTILE.map((v) => ({
        bet: { id: v } as any,
        fills: [{ matchedBetId: v } as any],
        isFilled: false,
        amount: 1,
        shares: 2,
      }))
    )
    await run(query)
    const rows = (await db.query<any>(`select * from contract_bets`)).rows
    expect(rows).toHaveLength(HOSTILE.length)
    for (const r of rows) {
      expect(r.data.fills).toEqual([{ matchedBetId: r.bet_id }])
    }
  })

  it('increments balances and rejects non-finite deltas', async () => {
    await db.exec(`create table if not exists users (id text primary key,
      balance numeric, cash_balance numeric, spice_balance numeric,
      total_deposits numeric, total_cash_deposits numeric)`)
    await db.query(`insert into users values ('u', 10, 0, 0, 5, 0)`)
    await incrementBalance(
      pg,
      'u',
      { balance: -2.5, totalDeposits: 1 },
      { broadcast: false }
    )
    const [u] = (await db.query<any>(`select * from users`)).rows
    expect([Number(u.balance), Number(u.total_deposits)]).toEqual([7.5, 6])
    await expect(
      incrementBalance(pg, 'u', { balance: Infinity }, { broadcast: false })
    ).rejects.toThrow()
  })
})

describe('sql-builder', () => {
  it.each([-1, NaN, Infinity, '1; select 1' as any])(
    'limit rejects %s',
    (n) => {
      expect(() => limitSql(n)).toThrow()
      expect(() => limitSql(10, n)).toThrow()
    }
  )

  it('limit renders counts', () => {
    expect(renderSql(select('1'), limitSql(10, 20))).toContain(
      'limit 10\noffset 20'
    )
  })
})

describe('rendered SQL is not formatted again', () => {
  const searchArgs = {
    term: '',
    filter: 'open',
    contractType: 'ALL',
    limit: 4,
    offset: 0,
    sort: 'score',
    token: 'MANA' as const,
  }
  const privateUser = {
    blockedByUserIds: ['$1'],
    blockedContractIds: ['$2:raw'],
    blockedUserIds: ['${constructor}'],
    blockedGroupSlugs: ['$1^', "it's"],
  } as any

  it('for-you search binds every placeholder it uses', async () => {
    // Topic scores present, so the for-you query (not the basic fallback)
    // is built; the score thresholds come from a stub.
    userIdsToAverageTopicConversionScores['u1'] = { g1: 0.4, g2: 0.6 }
    jest.mocked(createSupabaseDirectClient).mockReturnValue({
      one: async (_sql: string, _values: unknown, map: (r: any) => any) =>
        map({ importance_score: 0.5, freshness_score: 0.5 }),
    } as any)
    for (const sort of ['score', 'freshness-score']) {
      expectNoUnboundPlaceholders(
        await getForYouSQL({
          ...searchArgs,
          sort,
          privateUser,
          uid: 'u1',
        } as any)
      )
    }
  })

  it('search builders bind every placeholder they use', () => {
    expectNoUnboundPlaceholders(
      basicSearchSQL({ ...searchArgs, privateUser, uid: 'u1' } as any)
    )
    expectNoUnboundPlaceholders(
      getSemanticSearchContractSQL({
        ...searchArgs,
        embedding: [0.1, 0.2],
        privateUser,
      } as any)
    )
  })

  it('reposts keep block-list values literal', async () => {
    let rendered = ''
    const fake: any = {
      map: async (sql: string, values: unknown) => {
        rendered = pgp.as.format(sql, values)
        return []
      },
    }
    const blockSql = renderSql(privateUserBlocksSql(privateUser)).replace(
      /^where /,
      'and '
    )
    await getFollowedReposts('u1', 5, 0, {}, blockSql, fake)
    expectSingleStatement(rendered)
    for (const v of ['$1', '$2:raw', '${constructor}', '$1^', "it''s"]) {
      expect(rendered).toContain(`'${v}'`)
    }
  })

  it('privacy filter quotes the user id', () => {
    const sql = getContractPrivacyWhereSQLFilter(`x' or true or '`, 'c.id')
    expectSingleStatement(sql)
    expect(sql).toContain(`creator_id='x'' or true or '''`)
    expect(getContractPrivacyWhereSQLFilter('abc', 'c.id')).toContain(
      `select 1 from contract_bets where contract_id = c.id and user_id = 'abc')`
    )
  })
})

describe('bulkUpdateQuery rejects rows it cannot write faithfully', () => {
  const rows = (second: Record<string, unknown>) => [
    { id: 'a', prob: 0.5, prob_change_week: 0.1 },
    { id: 'b', ...second },
  ]

  it.each([
    ['a missing column', { prob: 0.4 }],
    ['an undefined value', { prob: 0.4, prob_change_week: undefined }],
    ['NaN', { prob: NaN, prob_change_week: 0.2 }],
    ['Infinity', { prob: 0.4, prob_change_week: Infinity }],
    ['-Infinity', { prob: -Infinity, prob_change_week: 0.2 }],
  ])('throws on %s', (_name, second) => {
    expect(() =>
      bulkUpdateQuery('answers', ['id'], rows(second) as any)
    ).toThrow()
  })

  it('still writes nulls, zeros and negative numbers', () => {
    const sql = bulkUpdateQuery(
      'answers',
      ['id'],
      rows({ prob: 0, prob_change_week: null }) as any
    )
    expect(sql).toContain(`('b',0,null)`)
    expectSingleStatement(sql)
    expect(
      bulkUpdateQuery(
        'answers',
        ['id'],
        rows({ prob: -1, prob_change_week: -0.5 }) as any
      )
    ).toContain(`('b',-1,-0.5)`)
  })
})
