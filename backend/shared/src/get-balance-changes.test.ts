import { PGlite } from '@electric-sql/pglite'
import * as pgPromise from 'pg-promise'
import { getBalanceChanges } from 'api/get-balance-changes'
import { AnyBalanceChangeType } from 'common/balance-change'
import { createSupabaseDirectClient } from 'shared/supabase/init'

jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(),
}))
jest.mock('shared/helpers/openai-utils', () => ({}))
jest.mock('shared/helpers/prompt-ai', () => ({}))
jest.mock('shared/websockets/helpers', () => ({}))

jest.setTimeout(60_000)

type Props = {
  userId: string
  after: number
  before?: number
  limit: number
  offset: number
  changeType?: string
}
const handler = getBalanceChanges as unknown as (
  props: Props
) => Promise<AnyBalanceChangeType[]>

// The columns the balance log reads, with prod's triggers and time helpers.
const SCHEMA = `
create function millis_to_ts(millis bigint) returns timestamptz
  language sql immutable as $$ select to_timestamp(millis / 1000.0) $$;
create function ts_to_millis(ts timestamptz) returns bigint
  language sql immutable as $$ select (extract(epoch from ts) * 1000)::bigint $$;

create table users (id text primary key, username text, name text);
create table contracts (
  id text primary key, data jsonb not null, question text, slug text,
  visibility text, token text default 'MANA', importance_score numeric,
  home_page_score_adjustment numeric,
  home_page_score_adjustment_expires_at timestamptz, freshness_score numeric,
  conversion_score numeric, view_count bigint, boosted boolean,
  daily_score numeric
);
create table answers (
  id text primary key, contract_id text, index int, text text, user_id text,
  created_time timestamptz, prob numeric, pool_yes numeric, pool_no numeric
);
create table txns (
  amount numeric not null, category text not null,
  created_time timestamptz default now() not null, data jsonb not null,
  from_id text not null, from_type text not null, id text primary key,
  to_id text not null, to_type text not null, token text default 'M$' not null
);
create table contract_liquidity (
  contract_id text not null, data jsonb not null, liquidity_id text not null,
  created_time timestamptz default now(), user_id text not null,
  primary key (contract_id, liquidity_id)
);
create function contract_liquidity_populate_cols() returns trigger
  language plpgsql as $$
begin
  if new.data is not null then
    new.user_id := (new.data) ->> 'userId';
    new.created_time := millis_to_ts(((new.data) ->> 'createdTime')::bigint);
  end if;
  return new;
end $$;
create trigger contract_liquidity_populate before insert or update
  on contract_liquidity for each row
  execute function contract_liquidity_populate_cols();
create index contract_liquidity_user_id
  on contract_liquidity (user_id, created_time desc);
create table contract_bets (
  bet_id text primary key, contract_id text not null, user_id text not null,
  answer_id text, data jsonb not null, created_time timestamptz not null,
  updated_time timestamptz not null
);
create table contract_perp_events (
  id text primary key, ts timestamptz not null, direction text,
  size_delta numeric, original_cost_basis_delta numeric, oracle_price numeric,
  contract_id text not null, user_id text, event_type text not null
);
`

const ME = 'me'
const T0 = Date.parse('2026-06-01T00:00:00Z')
const MARKET_CREATED = T0 - 10 * 24 * 60 * 60 * 1000

const pgp = pgPromise()
let db: PGlite

// pg-promise formats the values as in production; PGlite runs the result.
const client = {
  map: async (
    sql: string,
    params: unknown,
    cb: (row: Record<string, unknown>) => unknown
  ) => (await db.query(pgp.as.format(sql, params))).rows.map(cb as never),
  multi: async (sql: string, params: unknown) =>
    (await db.exec(pgp.as.format(sql, params))).map((r) => r.rows),
} as unknown as ReturnType<typeof createSupabaseDirectClient>

const insert = (table: string, row: Record<string, unknown>) => {
  const cols = Object.keys(row)
  return db.query(
    pgp.as.format(`insert into ${table} (${cols.join(', ')}) values ($1:csv)`, [
      cols.map((c) => row[c]),
    ])
  )
}

// Every event gets its own minute, so the expected order has no ties.
let minute = 0
const nextTime = () => T0 + ++minute * 60_000

const keysOf = (changes: AnyBalanceChangeType[]) => changes.map((c) => c.key)

beforeAll(async () => {
  db = new PGlite({
    parsers: {
      20: (v: string) => parseInt(v, 10),
      1700: (v: string) => parseFloat(v),
      1114: (v: string) => v,
      1184: (v: string) => v,
    },
  })
  await db.exec(SCHEMA)
  jest.mocked(createSupabaseDirectClient).mockReturnValue(client)

  await insert('users', { id: 'friend', username: 'friend', name: 'Friend' })
  await insert('users', { id: 'other', username: 'other', name: 'Other' })

  const market = (
    id: string,
    mechanism: string,
    visibility: string,
    extra: Record<string, unknown> = {}
  ) =>
    insert('contracts', {
      id,
      data: {
        id,
        mechanism,
        visibility,
        question: `Question ${id}`,
        slug: id,
        creatorUsername: 'creator',
        createdTime: MARKET_CREATED,
        ...extra,
      },
      question: `Question ${id}`,
      slug: id,
      visibility,
      token: 'MANA',
      importance_score: 0,
    })
  await market('mc', 'cpmm-multi-2', 'public')
  await market('bin', 'cpmm-1', 'public')
  await market('hidden-mc', 'cpmm-multi-2', 'unlisted')
  await market('perp', 'perp', 'public', { oracleFeedId: 'BTC' })
  for (const [id, contractId, index] of [
    ['mc-a0', 'mc', 0],
    ['mc-a1', 'mc', 1],
    ['mc-a2', 'mc', 2],
    ['hidden-a0', 'hidden-mc', 0],
  ] as const) {
    await insert('answers', {
      id,
      contract_id: contractId,
      index,
      text: `Answer ${id}`,
      created_time: new Date(MARKET_CREATED).toISOString(),
    })
  }

  const txn = (
    id: string,
    from: [string, string],
    to: [string, string],
    category: string,
    data: Record<string, unknown> = {}
  ) =>
    insert('txns', {
      id,
      amount: 10,
      category,
      created_time: new Date(nextTime()).toISOString(),
      data,
      from_id: from[0],
      from_type: from[1],
      to_id: to[0],
      to_type: to[1],
    })

  const liquidity = (id: string, data: Record<string, unknown>) =>
    insert('contract_liquidity', {
      contract_id: (data.contractId as string | undefined) ?? 'mc',
      liquidity_id: id,
      data: { id, userId: ME, amount: 25, createdTime: nextTime(), ...data },
    })

  const bet = (
    id: string,
    contractId: string,
    data: Record<string, unknown>
  ) => {
    const createdTime = nextTime()
    return insert('contract_bets', {
      bet_id: id,
      contract_id: contractId,
      user_id: (data.userId as string | undefined) ?? ME,
      answer_id: data.answerId ?? null,
      data: {
        id,
        userId: ME,
        contractId,
        createdTime,
        amount: 10,
        shares: 20,
        outcome: 'YES',
        isRedemption: false,
        ...data,
      },
      created_time: new Date(createdTime).toISOString(),
      updated_time: new Date(createdTime).toISOString(),
    })
  }

  const perpEvent = (id: string, eventType: string, userId = ME) =>
    insert('contract_perp_events', {
      id,
      ts: new Date(nextTime()).toISOString(),
      direction: 'long',
      size_delta: 500,
      original_cost_basis_delta: 100,
      oracle_price: 62_000,
      contract_id: 'perp',
      user_id: userId,
      event_type: eventType,
    })

  // Interleave the four sources over time.
  for (let round = 0; round < 6; round++) {
    await txn(`in-${round}`, ['friend', 'USER'], [ME, 'USER'], 'MANA_PAYMENT')
    await liquidity(`liq-${round}`, { contractId: 'mc', answerId: 'mc-a1' })
    await bet(`buy-${round}`, 'bin', {})
    await txn(`out-${round}`, [ME, 'USER'], ['friend', 'USER'], 'MANA_PAYMENT')
    await perpEvent(`liquidated-${round}`, 'liquidation')
    await txn(
      `streak-${round}`,
      ['BANK', 'BANK'],
      [ME, 'USER'],
      'BETTING_STREAK_BONUS'
    )
    await bet(`answer-buy-${round}`, 'mc', { answerId: 'mc-a2' })
    await txn(
      `payout-${round}`,
      ['bin', 'CONTRACT'],
      [ME, 'USER'],
      'CONTRACT_RESOLUTION_PAYOUT'
    )
    await liquidity(`hidden-liq-${round}`, {
      contractId: 'hidden-mc',
      answerId: 'hidden-a0',
    })
    await txn(
      `subsidy-${round}`,
      [ME, 'USER'],
      ['mc', 'CONTRACT'],
      'ADD_SUBSIDY',
      { data: { answerId: 'mc-a0' } }
    )
    // Rows the log never shows.
    await liquidity(`no-contract-id-${round}`, {
      contractId: undefined,
      answerId: 'mc-a0',
    })
    await liquidity(`gone-market-${round}`, {
      contractId: 'gone',
      answerId: 'x',
    })
    await liquidity(`market-level-${round}`, { contractId: 'mc' })
    await liquidity(`someone-else-${round}`, {
      contractId: 'mc',
      answerId: 'mc-a0',
      userId: 'other',
    })
    await txn(
      `unrelated-${round}`,
      ['friend', 'USER'],
      ['other', 'USER'],
      'MANA_PAYMENT'
    )
    await perpEvent(`opened-${round}`, 'open')
    await perpEvent(`other-liquidated-${round}`, 'liquidation', 'other')
  }
  await txn('self-transfer', [ME, 'USER'], [ME, 'USER'], 'MANA_PAYMENT')
  // The ante, already shown by its txn, sits within 100 ms of the market.
  await insert('contract_liquidity', {
    contract_id: 'mc',
    liquidity_id: 'ante',
    data: {
      id: 'ante',
      userId: ME,
      contractId: 'mc',
      answerId: 'mc-a0',
      amount: 100,
      createdTime: MARKET_CREATED + 50,
    },
  })
  // Two redemptions in a row: the first is folded into the second. (A
  // zero-amount redemption on its own is hidden too.)
  await bet('redeem-1', 'bin', { isRedemption: true, amount: 0, shares: -5 })
  await bet('redeem-2', 'bin', { isRedemption: true, amount: -5, shares: -5 })
  // A limit order shows one row per fill, at the fill's time.
  const fills = [
    { timestamp: nextTime(), amount: 4 },
    { timestamp: nextTime(), amount: 6 },
  ]
  await bet('limit', 'bin', { limitProb: 0.4, fills })

  // Thirty txns at one instant (one database transaction), then two in the
  // same millisecond 800 microseconds apart, the later one with the smaller
  // id. The log shows a millisecond's txns oldest first.
  const instant = new Date(nextTime()).toISOString()
  for (let i = 0; i < 30; i++) {
    await insert('txns', {
      id: `tie-${String(i).padStart(2, '0')}`,
      amount: 1,
      category: 'MANA_PAYMENT',
      created_time: instant,
      data: {},
      from_id: 'friend',
      from_type: 'USER',
      to_id: ME,
      to_type: 'USER',
    })
  }
  const millisecond = new Date(nextTime()).toISOString()
  for (const [id, micros] of [
    ['sub-ms-a-later', '900'],
    ['sub-ms-z-earlier', '100'],
  ]) {
    await insert('txns', {
      id,
      amount: 1,
      category: 'MANA_PAYMENT',
      created_time: millisecond.replace('Z', `${micros}Z`),
      data: {},
      from_id: ME,
      from_type: 'USER',
      to_id: 'friend',
      to_type: 'USER',
    })
  }

  // A market created last, so its ante is the user's newest liquidity row.
  const lateCreated = nextTime()
  await market('late-mc', 'cpmm-multi-2', 'public', {
    createdTime: lateCreated,
  })
  await insert('contract_liquidity', {
    contract_id: 'late-mc',
    liquidity_id: 'late-ante',
    data: {
      id: 'late-ante',
      userId: ME,
      contractId: 'late-mc',
      answerId: 'late-a0',
      amount: 100,
      createdTime: lateCreated + 30,
    },
  })

  // A user with only liquidity rows, the newest of them an ante: a one-row
  // page must skip it and show the older provision.
  await liquidity('subsidizer-older', {
    userId: 'subsidizer',
    contractId: 'mc',
    answerId: 'mc-a1',
    createdTime: lateCreated - 60_000,
  })
  await liquidity('subsidizer-ante', {
    userId: 'subsidizer',
    contractId: 'late-mc',
    answerId: 'late-a0',
    createdTime: lateCreated + 40,
  })

  // Market times as the ante check reads them in JS: a JSON null is 0 and a
  // missing one is NaN. The 'early' user's rows sit at 25-75 ms after 1970.
  await market('null-time', 'cpmm-multi-2', 'public', { createdTime: null })
  await market('ancient', 'cpmm-multi-2', 'public', { createdTime: -1000 })
  await insert('contracts', {
    id: 'no-time',
    data: { id: 'no-time', mechanism: 'cpmm-multi-2', visibility: 'public' },
    visibility: 'public',
    token: 'MANA',
    importance_score: 0,
  })
  for (const [id, contractId, createdTime] of [
    ['early-null', 'null-time', 50],
    ['early-missing', 'no-time', 75],
    ['early-ancient', 'ancient', 25],
  ] as const) {
    await liquidity(id, {
      userId: 'early',
      contractId,
      answerId: 'a',
      createdTime,
    })
  }
})

afterAll(async () => {
  await db.close()
})

const fullLog = (props: Omit<Props, 'limit' | 'offset'>) =>
  handler({ ...props, limit: 1000, offset: 0 })

describe('get-balance-changes', () => {
  it('shows each of the user changes once, newest first', async () => {
    const full = await fullLog({ userId: ME, after: 0 })
    const keys = keysOf(full)

    expect(new Set(keys).size).toBe(keys.length)
    expect(keys.filter((k) => k === 'self-transfer')).toHaveLength(1)
    for (let round = 0; round < 6; round++) {
      for (const k of [
        'in',
        'out',
        'streak',
        'payout',
        'subsidy',
        'liq',
        'hidden-liq',
        'buy',
        'answer-buy',
      ])
        expect(keys).toContain(`${k}-${round}`)
      expect(keys).toContain(`perp-liquidation-liquidated-${round}`)
      for (const k of [
        'no-contract-id',
        'gone-market',
        'market-level',
        'someone-else',
        'unrelated',
      ])
        expect(keys).not.toContain(`${k}-${round}`)
      expect(keys).not.toContain(`perp-liquidation-opened-${round}`)
      expect(keys).not.toContain(`perp-liquidation-other-liquidated-${round}`)
    }
    expect(keys).not.toContain('ante')
    expect(keys).not.toContain('late-ante')
    expect(keys).not.toContain('redeem-1')
    expect(keys).toContain('redeem-2')
    expect(keys.filter((k) => k.startsWith('limit-'))).toHaveLength(2)

    const times = full.map((c) => c.createdTime)
    expect(times).toEqual([...times].sort((a, b) => b - a))
  })

  it('names the answer only on public multiple choice markets', async () => {
    const full = await fullLog({ userId: ME, after: 0 })
    const byKey = new Map(full.map((c) => [c.key, c]))
    expect(byKey.get('liq-0')).toMatchObject({
      type: 'ADD_SUBSIDY',
      answerText: 'Answer mc-a1',
      contract: { question: 'Question mc', slug: 'mc' },
    })
    expect(byKey.get('hidden-liq-0')).toMatchObject({
      answerText: undefined,
      contract: { question: '[unlisted question]', slug: '' },
    })
    expect(byKey.get('in-0')).toMatchObject({
      user: { username: 'friend', name: 'Friend' },
    })
    expect(byKey.get('payout-0')).toMatchObject({
      contract: { question: 'Question bin' },
    })
  })

  // Each source now reads only its newest offset + limit rows, so every page
  // must equal the same slice of the full log.
  it.each([
    ['everything', {}],
    ['subsidies', { changeType: 'ADD_SUBSIDY' }],
    ['perp liquidations', { changeType: 'perp_liquidation' }],
    ['one txn category', { changeType: 'MANA_PAYMENT' }],
    ['one bet type', { changeType: 'create_bet' }],
  ])('pages %s exactly as the full log', async (_name, filter) => {
    const full = await fullLog({ userId: ME, after: 0, ...filter })
    expect(full.length).toBeGreaterThan(0)
    for (const limit of [1, 2, 3, 7, 50]) {
      for (const offset of [0, 1, 2, 5, 13, full.length - 1, full.length]) {
        const page = await handler({
          userId: ME,
          after: 0,
          limit,
          offset,
          ...filter,
        })
        expect(keysOf(page)).toEqual(keysOf(full.slice(offset, offset + limit)))
        expect(page).toEqual(full.slice(offset, offset + limit))
      }
    }
  })

  it('pages a date window exactly as the full window', async () => {
    const window = {
      userId: ME,
      after: T0 + 20 * 60_000,
      before: T0 + 80 * 60_000,
    }
    const full = await fullLog(window)
    expect(full.length).toBeGreaterThan(10)
    for (const c of full) {
      expect(c.createdTime).toBeGreaterThanOrEqual(window.after)
      expect(c.createdTime).toBeLessThan(window.before)
    }
    for (const limit of [1, 4, 9]) {
      for (const offset of [0, 3, 8]) {
        const page = await handler({ ...window, limit, offset })
        expect(page).toEqual(full.slice(offset, offset + limit))
      }
    }
  })

  it("keeps a millisecond's txns oldest first, the same on every page", async () => {
    for (const filter of [{}, { changeType: 'MANA_PAYMENT' }]) {
      const full = await fullLog({ userId: ME, after: 0, ...filter })
      const keys = keysOf(full)
      expect(keys.indexOf('sub-ms-z-earlier')).toBeLessThan(
        keys.indexOf('sub-ms-a-later')
      )
      const ties = keys.filter((k) => k.startsWith('tie-'))
      expect(ties).toHaveLength(30)
      expect(ties).toEqual([...ties].sort())

      // One row per page, all the way down: every row once, in order.
      const walked: string[] = []
      for (let offset = 0; offset < full.length; offset++) {
        const page = await handler({
          userId: ME,
          after: 0,
          limit: 1,
          offset,
          ...filter,
        })
        walked.push(...keysOf(page))
      }
      expect(walked).toEqual(keys)
    }
  })

  it('treats an empty changeType as no filter', async () => {
    const all = await fullLog({ userId: ME, after: 0 })
    await expect(
      fullLog({ userId: ME, after: 0, changeType: '' })
    ).resolves.toEqual(all)
    await expect(
      handler({ userId: ME, after: 0, changeType: '', limit: 3, offset: 4 })
    ).resolves.toEqual(all.slice(4, 7))
  })

  it('skips a newest ante without shortening the page', async () => {
    for (const changeType of [undefined, 'ADD_SUBSIDY']) {
      const page = await handler({
        userId: 'subsidizer',
        after: 0,
        limit: 1,
        offset: 0,
        changeType,
      })
      expect(keysOf(page)).toEqual(['subsidizer-older'])
    }
  })

  it('reads market times as JS does when skipping antes', async () => {
    const page = (offset: number) =>
      handler({
        userId: 'early',
        after: 0,
        limit: 1,
        offset,
        changeType: 'ADD_SUBSIDY',
      })
    // early-null (50 ms) is skipped: 50 - null is 50 in JS, under 100.
    expect(keysOf(await page(0))).toEqual(['early-missing'])
    expect(keysOf(await page(1))).toEqual(['early-ancient'])
    expect(await page(2)).toEqual([])
  })

  it('returns nothing for an offset past every row', async () => {
    const full = await fullLog({ userId: ME, after: 0 })
    for (const offset of [Infinity, 1e19, 2 ** 32 - 1, full.length + 1e6]) {
      for (const changeType of [undefined, 'MANA_PAYMENT']) {
        await expect(
          handler({ userId: ME, after: 0, limit: 10, offset, changeType })
        ).resolves.toEqual([])
      }
    }
  })
})
