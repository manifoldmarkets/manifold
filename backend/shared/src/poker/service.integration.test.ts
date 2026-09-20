/** Real PostgreSQL tests; each run creates and drops its own database.
 * POKER_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55439/postgres
 * yarn --cwd backend/shared test poker/service.integration --runInBand
 */
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as pgPromise from 'pg-promise'
import { PokerAction } from 'common/poker/types'
import { pokerAPI } from 'common/poker/api'
jest.mock('common/envs/constants', () => ({
  ...jest.requireActual('common/envs/constants'),
  isAdminId: (id: string) => id === 'u9',
}))

let mockDb: pgPromise.IDatabase<{}>
jest.mock('shared/supabase/init', () => {
  const pgp = jest.requireActual<typeof import('pg-promise')>('pg-promise')()
  pgp.pg.types.setTypeParser(20, Number)
  pgp.pg.types.setTypeParser(1700, Number)
  return { pgp, createSupabaseDirectClient: () => mockDb }
})
jest.mock('shared/utils', () => ({
  log: Object.assign(jest.fn(), { warn: jest.fn(), error: jest.fn() }),
}))
jest.mock('shared/supabase/users', () => ({ broadcastUserUpdates: jest.fn() }))
jest.mock('shared/websockets/server', () => ({ broadcast: jest.fn() }))
import {
  actPoker,
  createPokerTable,
  getPokerTable,
  listPokerTables,
  tickPoker,
} from './service'
import { pgp } from 'shared/supabase/init'
import { getManaSupply, getManaSupplyEachDayBetweeen } from 'shared/mana-supply'
jest.mock('shared/update-user-portfolio-histories-core', () => ({
  updateUserPortfolioHistoriesCore: jest.fn(),
}))
import { broadcast } from 'shared/websockets/server'
import { broadcastUserUpdates } from 'shared/supabase/users'

const url = process.env.POKER_TEST_DATABASE_URL
const suite = url ? describe : describe.skip
suite('poker database transactions', () => {
  let admin: pgPromise.IDatabase<{}>
  const database = `poker_test_${process.pid}_${Date.now()}`
  const roomMigration = readFileSync(
    resolve(
      __dirname,
      '../../../supabase/migrations/2026091701_permanent_poker_rooms.sql'
    ),
    'utf8'
  )
  let publicRooms: { id: string; name: string; ante: number }[]
  beforeAll(async () => {
    const parsed = new URL(url!)
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname))
      throw new Error('Poker integration tests require a local database')
    admin = pgp(url!)
    await admin.none(`create database ${database}`)
    parsed.pathname = `/${database}`
    mockDb = pgp(parsed.toString())
    await mockDb.none(`
      do $$ begin if not exists(select from pg_roles where rolname='anon') then create role anon; end if;
      if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if; end $$;
      create table users(id text primary key,name text,username text,balance numeric not null,total_deposits numeric not null,cash_balance numeric default 0,spice_balance numeric default 0,total_cash_deposits numeric default 0,data jsonb not null);
      create table user_bans(user_id text references users(id),ban_type text,ended_at timestamptz,end_time timestamptz);
      create function millis_to_ts(ms bigint) returns timestamptz language sql immutable as $$ select to_timestamp(ms::double precision / 1000) $$;
      create table user_portfolio_history_latest(user_id text references users(id),investment_value numeric default 0,cash_investment_value numeric default 0,loan_total numeric default 0);
      create table user_portfolio_history(user_id text references users(id),ts timestamptz,balance numeric,spice_balance numeric default 0,cash_balance numeric default 0,investment_value numeric default 0,cash_investment_value numeric default 0,loan_total numeric default 0);
      create table contracts(id text primary key,data jsonb,token text,mechanism text,resolution text);
      create table answers(contract_id text,prob numeric,pool_yes numeric,pool_no numeric,subsidy_pool numeric);
      insert into contracts values ('market','{"prob":0.5,"pool":{"YES":0,"NO":0},"subsidyPool":0}','MANA','cpmm-1',null);
      insert into answers values ('market',0.5,0,0,0);
      create table txns(id text primary key default gen_random_uuid()::text,amount numeric not null,category text not null,created_time timestamptz default now(),data jsonb not null,from_id text not null,from_type text not null,to_id text not null,to_type text not null,token text not null);
    `)
    await mockDb.none(
      readFileSync(
        resolve(__dirname, '../../../supabase/migrations/2026091501_poker.sql'),
        'utf8'
      )
    )
    await mockDb.none(roomMigration)
    publicRooms = await mockDb.many(
      'select id,name,ante from poker_tables where creator_id is null order by ante'
    )
  })
  afterAll(async () => {
    await mockDb?.$pool.end()
    if (admin) {
      await admin.none(`drop database if exists ${database}`)
      await admin.$pool.end()
    }
  })
  beforeEach(async () => {
    await mockDb.none(
      'truncate users cascade; update poker_settings set new_hands_enabled=true'
    )
    for (let i = 0; i < 10; i++)
      await mockDb.none(
        'insert into users(id,name,username,balance,total_deposits,data) values($1,$1,$1,1000,1000,$2::jsonb)',
        [
          `u${i}`,
          JSON.stringify({ name: `Player ${i}`, username: `player${i}` }),
        ]
      )
    for (const room of publicRooms)
      await mockDb.none(
        "insert into poker_tables(id,name,ante,creator_id,visibility,started) values($1,$2,$3,null,'public',true)",
        [room.id, room.name, room.ante]
      )
    jest.clearAllMocks()
  })
  const make = async (
    visibility: 'public' | 'private' = 'public',
    ante = 1
  ) => {
    const accessToken = visibility === 'private' ? 'a'.repeat(64) : undefined
    const tableId: string = randomUUID()
    if (visibility === 'private') {
      await createPokerTable('u0', {
        requestId: tableId,
        ante,
        visibility,
        accessToken,
      })
    } else {
      // Legacy public tables exercise arbitrary antes and retirement behavior.
      await mockDb.none(
        "insert into poker_tables(id,creator_id,name,visibility,ante,started) values($1,'u0','Legacy table','public',$2,true)",
        [tableId, ante]
      )
    }
    return { tableId, accessToken }
  }
  type Access = Awaited<ReturnType<typeof make>>
  const act = async (
    t: Access,
    user: string,
    action: PokerAction,
    requestId = randomUUID()
  ) => {
    const view = await getPokerTable(t.tableId, t.accessToken, user)
    return actPoker(user, { ...t, requestId, version: view.version, action })
  }
  const seat = async (t: Access, ids = ['u0', 'u1']) => {
    for (const id of ids) {
      await act(t, id, { type: 'join' })
      await act(t, id, { type: 'ready', ready: true })
    }
  }
  const due = async (t: Access) => {
    await mockDb.none('update poker_tables set next_tick=0 where id=$1', [
      t.tableId,
    ])
    await tickPoker()
  }
  const deal = async (t: Access, ids = ['u0', 'u1']) => {
    await seat(t, ids)
    if (t.accessToken) await act(t, 'u0', { type: 'start' })
    await due(t)
    return (await getPokerTable(t.tableId, t.accessToken, 'u0')).hand!
  }
  const move = async (
    t: Access,
    id: string,
    m: 'rock' | 'paper' | 'scissors'
  ) => {
    const v = await getPokerTable(t.tableId, t.accessToken, id)
    return act(t, id, {
      type: 'move',
      handId: v.hand!.id,
      street: v.hand!.street,
      move: m,
    })
  }
  const total = async () =>
    Number(
      (
        await mockDb.one(
          'select (select sum(balance) from users)+(select coalesce(sum(escrow),0) from poker_hands) as total'
        )
      ).total
    )

  it('keeps chat and mute independent of gameplay versions and seated wallets', async () => {
    const t = await make('private')
    await seat(t)
    const before = await getPokerTable(t.tableId, t.accessToken, 'u0')
    jest.clearAllMocks()
    // A different transaction holds a player's wallet. Spectator chat and host
    // mute must still finish without waiting for every seated account.
    await mockDb.tx(async (tx) => {
      await tx.one("select id from users where id='u1' for update")
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          (async () => {
            await act(t, 'u2', { type: 'chat', text: 'Hello' })
            await act(t, 'u0', { type: 'mute', userId: 'u2', enabled: true })
          })(),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new Error('Chat waited for a wallet lock')),
              2000
            )
          }),
        ])
      } finally {
        clearTimeout(timer)
      }
    })
    const after = await getPokerTable(t.tableId, t.accessToken, 'u2')
    expect(after.version).toBe(before.version)
    expect(after.messages.map((m) => m.text)).toEqual(['Hello'])
    expect(after.viewer.muted).toBe(true)
    expect(broadcastUserUpdates).not.toHaveBeenCalled()
    await expect(
      act(t, 'u2', { type: 'chat', text: 'Muted' })
    ).rejects.toMatchObject({ code: 403 })
    // Both operations use the pre-chat version the players already saw.
    await actPoker('u1', {
      ...t,
      requestId: randomUUID(),
      version: before.version,
      action: { type: 'ready', ready: true },
    })
    const startVersion = (await getPokerTable(t.tableId, t.accessToken)).version
    await act(t, 'u3', { type: 'chat', text: 'Good luck' })
    await actPoker('u0', {
      ...t,
      requestId: randomUUID(),
      version: startVersion,
      action: { type: 'start' },
    })
  })

  it('notifies only committed changes and wallets with transfers', async () => {
    const t = await make()
    await seat(t)
    jest.clearAllMocks()
    const requestId = randomUUID()
    await act(t, 'u2', { type: 'chat', text: 'Hello' }, requestId)
    expect(broadcast).toHaveBeenCalledTimes(1)
    expect(broadcastUserUpdates).not.toHaveBeenCalled()
    await act(t, 'u2', { type: 'chat', text: 'Hello' }, requestId)
    expect(broadcast).toHaveBeenCalledTimes(1)
    jest.clearAllMocks()
    await due(t)
    expect(broadcast).toHaveBeenCalledTimes(1)
    expect(broadcastUserUpdates).toHaveBeenCalledTimes(1)
    expect(
      jest.mocked(broadcastUserUpdates).mock.calls[0][0].map((u) => u.id)
    ).toEqual(['u0', 'u1'])
    jest.clearAllMocks()
    await move(t, 'u0', 'scissors')
    expect(broadcast).toHaveBeenCalledTimes(1)
    expect(broadcastUserUpdates).not.toHaveBeenCalled()
    // A second worker sees the due table but cannot obtain its lock.
    await mockDb.none('update poker_tables set next_tick=0 where id=$1', [
      t.tableId,
    ])
    jest.clearAllMocks()
    await mockDb.tx(async (tx) => {
      await tx.one('select id from poker_tables where id=$1 for update', [
        t.tableId,
      ])
      await tickPoker()
    })
    expect(broadcast).not.toHaveBeenCalled()
    expect(broadcastUserUpdates).not.toHaveBeenCalled()
  })

  it('hides disabled deal countdowns, stays quiet on retries, and resumes after enabling', async () => {
    const t = await make()
    await seat(t)
    await mockDb.none('update poker_settings set new_hands_enabled=false')
    jest.clearAllMocks()
    await due(t)
    await due(t)
    const paused = await getPokerTable(t.tableId)
    expect(paused.newHandsEnabled).toBe(false)
    expect(paused.nextDealAt).toBeNull()
    expect(paused.table.status).toBe('waiting')
    expect((await getPokerTable(t.tableId, t.accessToken)).table.status).toBe(
      'waiting'
    )
    expect(paused.hand).toBeNull()
    expect(broadcast).not.toHaveBeenCalled()
    expect(broadcastUserUpdates).not.toHaveBeenCalled()
    await mockDb.none('update poker_settings set new_hands_enabled=true')
    await due(t)
    const active = await getPokerTable(t.tableId)
    expect(active.table.status).toBe('playing')
    expect(active.hand?.deadline).toBeGreaterThan(Date.now())
    await mockDb.none('update poker_settings set new_hands_enabled=false')
    await move(t, 'u0', 'rock')
    await move(t, 'u1', 'paper')
    const finished = await getPokerTable(t.tableId)
    expect(finished.hand?.settlement).toBeDefined()
    expect(finished.nextDealAt).toBeNull()
  })

  it('includes escrow in live and historical mana supply, without affecting market profit', async () => {
    await mockDb.none(
      'insert into user_portfolio_history_latest(user_id) select id from users'
    )
    const before = await getManaSupply(mockDb)
    const t = await make()
    await deal(t)
    const active = await getManaSupply(mockDb)
    expect(active.totalManaValue).toBe(before.totalManaValue)
    expect(active.pokerEscrow).toBe(2)
    await mockDb.none(
      'insert into user_portfolio_history(user_id,ts,balance) select id,now(),balance from users'
    )
    // PostgreSQL timestamps have finer precision than JavaScript milliseconds.
    const now = Date.now() + 1000
    const history = await getManaSupplyEachDayBetweeen(
      mockDb,
      now - 86400000,
      1
    )
    expect(history[0].totalManaValue).toBe(before.totalManaValue)
    expect(history[0].pokerEscrow).toBe(2)
    await move(t, 'u0', 'rock')
    await move(t, 'u1', 'paper')
    const settled = await getManaSupply(mockDb)
    expect(settled.pokerEscrow).toBe(0)
    expect(settled.totalManaValue).toBe(before.totalManaValue)
  })
  it('caps tables at nine seats and rejects stale moves', async () => {
    const t = await make()
    for (let i = 0; i < 9; i++) await act(t, `u${i}`, { type: 'join' })
    await expect(act(t, 'u9', { type: 'join' })).rejects.toMatchObject({
      code: 409,
    })
    await act(t, 'u0', { type: 'ready', ready: true })
    await act(t, 'u1', { type: 'ready', ready: true })
    await due(t)
    const h = (await getPokerTable(t.tableId)).hand!
    await move(t, 'u0', 'scissors')
    await move(t, 'u1', 'scissors')
    await expect(
      act(t, 'u0', { type: 'move', handId: h.id, street: 0, move: 'rock' })
    ).rejects.toMatchObject({ code: 409 })
  })
  it('lets hosts find and unban a removed spectator without exposing moderation lists', async () => {
    const t = await make()
    await act(t, 'u0', { type: 'ban', userId: 'u9', enabled: true })
    expect(
      (await getPokerTable(t.tableId, undefined, 'u0')).moderation
    ).toEqual([{ userId: 'u9', name: 'u9', muted: false, banned: true }])
    expect((await getPokerTable(t.tableId)).moderation).toEqual([])
    await expect(
      getPokerTable(t.tableId, undefined, 'u9')
    ).rejects.toMatchObject({ code: 403 })
    await act(t, 'u0', { type: 'ban', userId: 'u9', enabled: false })
    expect(
      (await getPokerTable(t.tableId, undefined, 'u9')).viewer.banned
    ).toBe(false)
  })
  it('requires exactly 100× at entry/resume without reserving funds', async () => {
    const t = await make()
    await mockDb.none('update users set balance=99.99 where id=$1', ['u0'])
    await expect(act(t, 'u0', { type: 'join' })).rejects.toMatchObject({
      code: 403,
    })
    await mockDb.none('update users set balance=100 where id=$1', ['u0'])
    await act(t, 'u0', { type: 'join' })
    await act(t, 'u0', { type: 'ready', ready: true })
    expect(
      (await mockDb.one('select balance from users where id=$1', ['u0']))
        .balance
    ).toBe(100)
    await act(t, 'u0', { type: 'ready', ready: false })
    await mockDb.none('update users set balance=99 where id=$1', ['u0'])
    await expect(
      act(t, 'u0', { type: 'ready', ready: true })
    ).rejects.toMatchObject({ code: 403 })
  })
  it('checks minimum again at first deal, but active players can keep playing short', async () => {
    const t = await make('public', 10)
    await seat(t)
    await mockDb.none('update users set balance=999 where id=$1', ['u0'])
    await due(t)
    expect((await getPokerTable(t.tableId)).hand).toBeNull()
    await mockDb.none('update users set balance=1000 where id=$1', ['u0'])
    await act(t, 'u0', { type: 'ready', ready: true })
    await due(t)
    await move(t, 'u0', 'rock')
    await move(t, 'u1', 'paper')
    await mockDb.none('update users set balance=3.75 where id=$1', ['u0'])
    await due(t)
    const view = await getPokerTable(t.tableId, undefined, 'u0')
    expect(view.hand!.number).toBe(2)
    expect(view.hand!.players[0]).toMatchObject({ allIn: true, contributed: 3 })
    expect(view.hand!.settlement).toBeDefined()
    // All contributions/refunds/payouts leave the .75 fraction untouched.
    expect(
      (await mockDb.one('select balance from users where id=$1', ['u0']))
        .balance % 1
    ).toBe(0.75)
  })
  it('requires creator start for a private table, then automatically continues', async () => {
    const t = await make('private')
    await seat(t)
    await tickPoker()
    expect((await getPokerTable(t.tableId, t.accessToken)).hand).toBeNull()
    await expect(act(t, 'u1', { type: 'start' })).rejects.toMatchObject({
      code: 403,
    })
    await act(t, 'u0', { type: 'start' })
    await due(t)
    await move(t, 'u0', 'rock')
    await move(t, 'u1', 'paper')
    await due(t)
    expect((await getPokerTable(t.tableId, t.accessToken)).hand!.number).toBe(2)
  })
  it('isolates private tables, moves, cards, database reads, and public transactions', async () => {
    const t = await make('private')
    await deal(t)
    expect((await listPokerTables()).tables.map((t) => t.id)).toEqual(
      publicRooms.map((r) => r.id)
    )
    await expect(getPokerTable(t.tableId)).rejects.toMatchObject({ code: 404 })
    await expect(
      getPokerTable(t.tableId, 'b'.repeat(64))
    ).rejects.toMatchObject({ code: 404 })
    await move(t, 'u0', 'rock')
    const guest = await getPokerTable(t.tableId, t.accessToken)
    expect(guest.hand).not.toHaveProperty('deck')
    expect(guest.hand?.yourMove).toBeUndefined()
    expect(guest.hand?.players.every((p) => !p.cards)).toBe(true)
    const owner = await getPokerTable(t.tableId, t.accessToken, 'u0')
    expect(owner.hand?.yourMove).toBe('rock')
    expect(owner.hand?.players[1].cards).toBeUndefined()
    const txns = await mockDb.manyOrNone('select * from txns')
    expect(JSON.stringify(txns)).not.toContain(t.tableId)
    expect(JSON.stringify(txns)).not.toContain(t.accessToken)
    expect(
      (broadcast as jest.Mock).mock.calls.every(
        ([topic, payload]) =>
          topic === 'poker' && JSON.stringify(payload) === '{}'
      )
    ).toBe(true)
    await expect(
      mockDb.tx(async (tx) => {
        await tx.none('set local role anon')
        await tx.any('select * from poker_hands')
      })
    ).rejects.toMatchObject({ code: '42501' })
  })
  it('releases only the authenticated private seat without an invite, with durable retries', async () => {
    const t = await make('private')
    await seat(t)
    const request = {
      tableId: t.tableId,
      requestId: randomUUID(),
      version: 0,
      action: { type: 'leave' as const },
    }
    await expect(
      getPokerTable(t.tableId, undefined, 'u1')
    ).rejects.toMatchObject({ code: 404 })
    await expect(actPoker('u2', request)).rejects.toMatchObject({ code: 404 })
    for (const action of [
      { type: 'ready', ready: false },
      { type: 'start' },
      { type: 'chat', text: 'hello' },
    ] as PokerAction[])
      await expect(
        actPoker('u1', { ...request, action })
      ).rejects.toMatchObject({ code: 404 })
    await actPoker('u1', request)
    expect((await listPokerTables('u1')).yourTableId).toBeUndefined()
    const other = await make()
    await act(other, 'u1', { type: 'join' })
    await actPoker('u1', request)
    expect((await listPokerTables('u1')).yourTableId).toBe(other.tableId)
    expect(
      (await getPokerTable(t.tableId, t.accessToken)).seats.map((s) => s.userId)
    ).toEqual(['u0'])
  })
  it('queues invite-free departure until the current private hand settles', async () => {
    const t = await make('private')
    await deal(t)
    await move(t, 'u0', 'rock')
    const request = {
      tableId: t.tableId,
      requestId: randomUUID(),
      version: 0,
      action: { type: 'leave' as const },
    }
    await actPoker('u0', request)
    const view = await getPokerTable(t.tableId, t.accessToken, 'u0')
    expect(view.hand?.yourMove).toBe('rock')
    expect(view.closing).toBe(true)
    expect(view.table.status).toBe('playing')
    expect(view.seats.find((s) => s.userId === 'u0')?.leaving).toBe(true)
    await move(t, 'u1', 'paper')
    expect(
      (await getPokerTable(t.tableId, t.accessToken)).hand?.settlement?.payouts
        .u0
    ).toBe(2)
    expect((await listPokerTables('u0')).yourTableId).toBeUndefined()
    await actPoker('u0', request)
    const closed = await getPokerTable(t.tableId, t.accessToken)
    expect(closed.table.status).toBe('closed')
    expect(closed.seats).toEqual([])
    expect(closed.nextDealAt).toBeNull()
    expect(await total()).toBe(10_000)
  })
  it.each(['public', 'private'] as const)(
    'closes a %s table when the host leaves before dealing',
    async (visibility) => {
      const t = await make(visibility)
      await seat(t)
      const request = {
        ...t,
        requestId: randomUUID(),
        version: 0,
        action: { type: 'leave' as const },
      }
      await actPoker('u0', request)
      await actPoker('u0', request)
      const view = await getPokerTable(t.tableId, t.accessToken)
      expect(view.table.status).toBe('closed')
      expect(view.seats).toEqual([])
      expect(view.hand).toBeNull()
      expect(view.nextDealAt).toBeNull()
      expect((await listPokerTables()).tables.map((t) => t.id)).toEqual(
        publicRooms.map((r) => r.id)
      )
      expect((await listPokerTables('u1')).yourTableId).toBeUndefined()
      await expect(act(t, 'u2', { type: 'join' })).rejects.toMatchObject({
        code: 409,
      })
      await due(t)
      expect((await getPokerTable(t.tableId, t.accessToken)).hand).toBeNull()
      expect(await total()).toBe(10_000)
    }
  )

  it('keeps departed non-hosts in settled results but removes their seats', async () => {
    const t = await make()
    await deal(t)
    await move(t, 'u0', 'rock')
    await move(t, 'u1', 'paper')
    await act(t, 'u1', { type: 'leave' })
    const view = await getPokerTable(t.tableId)
    expect(view.seats.map((s) => s.userId)).toEqual(['u0'])
    expect(view.hand?.players.map((p) => p.userId)).toEqual(['u0', 'u1'])
    expect(view.hand?.settlement).toBeDefined()
    expect(view.closing).toBe(false)
    expect((await getPokerTable(t.tableId)).table.seats).toBe(1)
    await act(t, 'u2', { type: 'join' })
    expect(
      (await getPokerTable(t.tableId)).seats.find((s) => s.seat === 1)?.userId
    ).toBe('u2')
    await act(t, 'u0', { type: 'leave' })
    const closed = await getPokerTable(t.tableId)
    expect(closed.table.status).toBe('closed')
    expect(closed.seats).toEqual([])
    expect(closed.hand?.settlement).toEqual(view.hand?.settlement)
    expect((await listPokerTables()).tables.map((t) => t.id)).toEqual(
      publicRooms.map((r) => r.id)
    )
  })

  it('finishes the hand when a host who joined mid-hand leaves', async () => {
    const t = await make()
    await deal(t, ['u1', 'u2'])
    await act(t, 'u0', { type: 'join' })
    await act(t, 'u0', { type: 'leave' })
    const closing = await getPokerTable(t.tableId)
    expect(closing.closing).toBe(true)
    expect(closing.table.status).toBe('playing')
    expect(closing.hand?.settlement).toBeUndefined()
    expect(closing.seats.map((s) => s.userId)).toEqual(['u1', 'u2'])
    await expect(act(t, 'u3', { type: 'join' })).rejects.toMatchObject({
      code: 403,
    })
    await move(t, 'u1', 'rock')
    await move(t, 'u2', 'paper')
    const closed = await getPokerTable(t.tableId)
    expect(closed.table.status).toBe('closed')
    expect(closed.seats).toEqual([])
    expect(closed.hand?.settlement?.payouts.u1).toBe(2)
    expect(await total()).toBe(10_000)
  })

  it('finishes a banned player’s current hand but collects no subsequent ante', async () => {
    const t = await make()
    await deal(t, ['u0', 'u1', 'u2'])
    await mockDb.none(
      "insert into user_bans(user_id,ban_type) values('u0','trading')"
    )
    await move(t, 'u0', 'rock')
    await move(t, 'u1', 'paper')
    await move(t, 'u2', 'paper')
    const before = await mockDb.one('select balance from users where id=$1', [
      'u0',
    ])
    await due(t)
    const view = await getPokerTable(t.tableId, undefined, 'u0')
    expect(view.hand?.number).toBe(2)
    expect(view.hand?.players.map((p) => p.userId)).toEqual(['u1', 'u2'])
    expect(view.seats.find((s) => s.userId === 'u0')).toMatchObject({
      ready: false,
      needsMinimum: true,
    })
    expect(
      await mockDb.one('select balance from users where id=$1', ['u0'])
    ).toEqual(before)
  })
  it('rechecks bans after readying but permits expired, ended, and unrelated bans', async () => {
    const t = await make()
    await seat(t, ['u0', 'u1', 'u2', 'u3'])
    await mockDb.none(`insert into user_bans(user_id,ban_type,ended_at,end_time) values
      ('u0','trading',null,null),
      ('u1','trading',null,now() - interval '1 second'),
      ('u2','trading',now(),null),
      ('u3','posting',null,null)`)
    await due(t)
    const view = await getPokerTable(t.tableId, undefined, 'u0')
    expect(view.hand?.players.map((p) => p.userId)).toEqual(['u1', 'u2', 'u3'])
    expect(
      await mockDb.one('select balance from users where id=$1', ['u0'])
    ).toEqual({ balance: 1000 })
  })
  it('serializes seat races across tables', async () => {
    const a = await make(),
      b = await make()
    const result = await Promise.allSettled([
      act(a, 'u0', { type: 'join' }),
      act(b, 'u0', { type: 'join' }),
    ])
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(
      (
        await mockDb.one(
          'select count(*)::int as n from poker_seats where user_id=$1',
          ['u0']
        )
      ).n
    ).toBe(1)
  })
  it('locks simultaneous moves once and does not double debit duplicate requests', async () => {
    const t = await make()
    const h = await deal(t)
    const v = await getPokerTable(t.tableId, undefined, 'u0')
    const request = {
      ...t,
      version: v.version,
      requestId: randomUUID(),
      action: {
        type: 'move' as const,
        handId: h.id,
        street: 0,
        move: 'rock' as const,
      },
    }
    const start = await total()
    await Promise.all([actPoker('u0', request), actPoker('u0', request)])
    await actPoker('u1', { ...request, requestId: randomUUID() })
    expect((await getPokerTable(t.tableId)).hand!.street).toBe(1)
    expect(
      (await mockDb.one('select count(*)::int as n from poker_moves')).n
    ).toBe(2)
    expect(
      (await mockDb.one('select count(*)::int as n from poker_ledger')).n
    ).toBe(4)
    expect(await total()).toBe(start)
    await actPoker('u0', request)
    expect(
      (await mockDb.one('select count(*)::int as n from poker_ledger')).n
    ).toBe(4)
  })
  it('uses fresh locked balances when spending races reveal', async () => {
    const t = await make('public', 5)
    await deal(t, ['u0', 'u1', 'u2'])
    await move(t, 'u0', 'rock')
    await move(t, 'u1', 'paper')
    let release!: () => void, locked!: () => void
    const held = new Promise<void>((r) => {
        locked = r
      }),
      gate = new Promise<void>((r) => {
        release = r
      })
    const spend = mockDb.tx(async (tx) => {
      await tx.one('select id from users where id=$1 for update', ['u0'])
      locked()
      await gate
      await tx.none('update users set balance=6.5 where id=$1', ['u0'])
    })
    await held
    const pending = move(t, 'u2', 'scissors')
    release()
    await spend
    await pending
    const v = await getPokerTable(t.tableId)
    expect(v.hand!.rounds[0].rocks).toBe(0)
    expect(v.hand!.rounds[0].moves[0]).toMatchObject({
      downgraded: true,
      move: 'scissors',
      paid: 0,
    })
    expect(v.hand!.players[1].folded).toBe(false)
    expect(
      (await mockDb.one('select balance from users where id=$1', ['u0']))
        .balance
    ).toBe(6.5)
  })
  it('survives concurrent timeout workers and marks absent players sitting out', async () => {
    const t = await make()
    const h = await deal(t)
    await mockDb.none(
      "update poker_hands set state=jsonb_set(state,'{deadline}','0') where id=$1",
      [h.id]
    )
    await mockDb.none('update poker_tables set next_tick=0 where id=$1', [
      t.tableId,
    ])
    await Promise.all([tickPoker(), tickPoker(), tickPoker()])
    const view = await getPokerTable(t.tableId)
    expect(view.hand!.rounds).toHaveLength(1)
    expect(view.hand!.street).toBe(1)
    expect(view.seats.every((s) => !s.ready && s.needsMinimum)).toBe(true)
  })
  it('defers ban removal and closure without changing accepted moves', async () => {
    const t = await make()
    await deal(t)
    await act(t, 'u0', { type: 'ban', userId: 'u1', enabled: true })
    await move(t, 'u1', 'scissors')
    await act(t, 'u0', { type: 'close' })
    await move(t, 'u0', 'scissors')
    for (let i = 0; i < 3; i++) {
      await move(t, 'u0', 'scissors')
      await move(t, 'u1', 'scissors')
    }
    const view = await getPokerTable(t.tableId)
    expect(view.table.status).toBe('closed')
    expect(view.seats).toEqual([])
    await expect(
      getPokerTable(t.tableId, undefined, 'u1')
    ).rejects.toMatchObject({ code: 403 })
    expect(
      (await mockDb.one('select sum(escrow) as sum from poker_hands')).sum
    ).toBe(0)
  })
  it('rolls back injected payout failures before retrying settlement exactly once', async () => {
    const t = await make()
    const h = await deal(t)
    await move(t, 'u0', 'rock')
    await mockDb.none(
      `create function fail_poker_payout() returns trigger language plpgsql as $$ begin if new.kind='payout' then raise exception 'injected payout failure'; end if; return new; end $$; create trigger fail_payout before insert on poker_ledger for each row execute function fail_poker_payout()`
    )
    await expect(move(t, 'u1', 'paper')).rejects.toThrow()
    const row = await mockDb.one('select * from poker_hands where id=$1', [
      h.id,
    ])
    expect(row.settled).toBe(false)
    expect(row.escrow).toBe(2)
    expect(
      (await mockDb.one('select count(*)::int as n from poker_moves')).n
    ).toBe(1)
    await mockDb.none(
      'drop trigger fail_payout on poker_ledger; drop function fail_poker_payout()'
    )
    await move(t, 'u1', 'paper')
    expect(
      (
        await mockDb.one(
          'select count(*)::int as n from poker_ledger where kind=$1',
          ['payout']
        )
      ).n
    ).toBe(1)
    expect(await total()).toBe(10000)
    expect(
      (
        await mockDb.one(
          'select sum(balance-total_deposits) as profit from users'
        )
      ).profit
    ).toBe(0)
  })
  it('pauses mismatched escrow without paying', async () => {
    const t = await make()
    const h = await deal(t)
    await move(t, 'u0', 'rock')
    await mockDb.none('update poker_hands set escrow=3 where id=$1', [h.id])
    await expect(move(t, 'u1', 'paper')).rejects.toMatchObject({ code: 503 })
    expect((await getPokerTable(t.tableId)).table.status).toBe('paused')
    expect(
      (
        await mockDb.one(
          'select count(*)::int as n from poker_ledger where kind=$1',
          ['payout']
        )
      ).n
    ).toBe(0)
  })
  it('stops new deals with the switch while allowing an active hand to finish', async () => {
    const t = await make()
    await deal(t)
    await mockDb.none('update poker_settings set new_hands_enabled=false')
    await move(t, 'u0', 'rock')
    await move(t, 'u1', 'paper')
    await due(t)
    const v = await getPokerTable(t.tableId)
    expect(v.hand!.number).toBe(1)
    expect(v.hand!.settlement).toBeDefined()
    expect(v.newHandsEnabled).toBe(false)
  })
  it('lists every open private room for its creator, including unseated hosts', async () => {
    const first = await make('private', 1)
    const second = await make('private', 5)
    const owner = await listPokerTables('u0')
    expect(owner.yourTableId).toBeUndefined()
    expect(owner.hostedTables).toHaveLength(2)
    expect(owner.hostedTables.map((t) => t.id).sort()).toEqual(
      [first.tableId, second.tableId].sort()
    )
    expect(owner.tables.map((t) => t.id)).toEqual(publicRooms.map((r) => r.id))
    expect(
      owner.hostedTables.every(
        (t) => Object.keys(t).sort().join(',') === 'ante,id,name'
      )
    ).toBe(true)
    expect((await listPokerTables('u1')).hostedTables).toEqual([])
    expect((await listPokerTables()).hostedTables).toEqual([])

    // A separate occupied seat must not hide any of the host's rooms.
    const publicRoom = { tableId: publicRooms[0].id, accessToken: undefined }
    await act(publicRoom, 'u0', { type: 'join' })
    const seated = await listPokerTables('u0')
    expect(seated.yourTableId).toBe(publicRoom.tableId)
    expect(seated.hostedTables).toEqual(owner.hostedTables)

    // The host can return with the saved invitation and close without sitting.
    await act(first, 'u0', { type: 'close' })
    expect((await listPokerTables('u0')).hostedTables.map((t) => t.id)).toEqual(
      [second.tableId]
    )
    await expect(getPokerTable(second.tableId)).rejects.toMatchObject({
      code: 404,
    })
  })

  it('lists exactly the two permanent rooms and rejects user-created public rooms', async () => {
    await make('private')
    await make('public')
    const lists = await Promise.all(
      Array.from({ length: 5 }, () => listPokerTables('u0'))
    )
    for (const list of lists) {
      expect(
        list.tables.map((t) => [
          t.ante,
          t.minimumBalance,
          t.creatorId,
          t.started,
        ])
      ).toEqual([
        [1, 100, null, true],
        [100, 10000, null, true],
      ])
    }
    const props = {
      requestId: randomUUID(),
      ante: 1,
      visibility: 'public' as const,
    }
    expect(pokerAPI['create-poker-table'].props.safeParse(props).success).toBe(
      false
    )
    expect(
      pokerAPI['create-poker-table'].props.safeParse({
        ...props,
        visibility: 'private',
      }).success
    ).toBe(false)
    await expect(createPokerTable('u0', props)).rejects.toMatchObject({
      code: 400,
    })
    const privateProps = {
      ...props,
      visibility: 'private' as const,
      accessToken: 'c'.repeat(64),
    }
    expect(pokerAPI['create-poker-table'].props.parse(privateProps)).toEqual(
      privateProps
    )
    await createPokerTable('u0', privateProps)
    await createPokerTable('u0', privateProps)
    expect(
      (await getPokerTable(props.requestId, privateProps.accessToken)).table
        .started
    ).toBe(false)
  })

  it('keeps public rooms open across departures, settlement, and subsequent deals', async () => {
    const t = { tableId: publicRooms[0].id, accessToken: undefined }
    await deal(t)
    await act(t, 'u0', { type: 'leave' })
    await move(t, 'u1', 'rock')
    await act(t, 'u1', { type: 'leave' })
    const empty = await getPokerTable(t.tableId)
    expect(empty.hand?.settlement).toBeDefined()
    expect(empty.closing).toBe(false)
    expect(empty.table.status).toBe('waiting')
    expect(empty.seats).toEqual([])
    const next = await deal(t, ['u2', 'u3'])
    expect(next.number).toBe(2)
    expect(await total()).toBe(10000)
  })

  it('enforces the M100 room entry requirement and allows admins to moderate but not close it', async () => {
    const t = { tableId: publicRooms[1].id, accessToken: undefined }
    await expect(act(t, 'u0', { type: 'join' })).rejects.toMatchObject({
      code: 403,
    })
    await mockDb.none(
      "update users set balance=10000,total_deposits=10000 where id='u0'"
    )
    await act(t, 'u0', { type: 'join' })
    await expect(act(t, 'u0', { type: 'close' })).rejects.toMatchObject({
      code: 403,
    })
    await expect(act(t, 'u9', { type: 'close' })).rejects.toMatchObject({
      code: 403,
    })
    await expect(
      act(t, 'u0', { type: 'mute', userId: 'u1', enabled: true })
    ).rejects.toMatchObject({ code: 403 })
    await act(t, 'u9', { type: 'mute', userId: 'u1', enabled: true })
    expect((await getPokerTable(t.tableId, undefined, 'u1')).viewer.muted).toBe(
      true
    )
    await act(t, 'u9', { type: 'ban', userId: 'u0', enabled: true })
    expect((await getPokerTable(t.tableId, undefined, 'u9')).seats).toEqual([])
    await expect(
      mockDb.none('update poker_tables set closed=true where id=$1', [
        t.tableId,
      ])
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      mockDb.none(
        "insert into poker_tables(id,name,visibility,ante,started) values($1,'Duplicate','public',100,true)",
        [randomUUID()]
      )
    ).rejects.toMatchObject({ code: '23505' })
  })

  it('retires legacy public rooms without touching active escrow', async () => {
    const t = await make()
    await deal(t)
    const before = await getPokerTable(t.tableId, undefined, 'u0')
    await mockDb.none(
      'delete from poker_tables where creator_id is null; alter table poker_tables drop constraint poker_permanent_room_config; drop index poker_one_permanent_room_per_ante'
    )
    await mockDb.none(roomMigration)
    const retiring = await getPokerTable(t.tableId, undefined, 'u0')
    expect(retiring.closing).toBe(true)
    expect(retiring.hand).toEqual(before.hand)
    expect(await total()).toBe(10000)
    await move(t, 'u0', 'rock')
    await move(t, 'u1', 'paper')
    const closed = await getPokerTable(t.tableId)
    expect(closed.table.status).toBe('closed')
    expect(closed.hand?.settlement).toBeDefined()
    expect(closed.seats).toEqual([])
    expect((await listPokerTables()).tables.map((t) => t.ante)).toEqual([
      1, 100,
    ])
    expect(await total()).toBe(10000)
  })
})
