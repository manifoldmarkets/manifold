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
import { FieldVal, updateDataQuery } from './utils'
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
