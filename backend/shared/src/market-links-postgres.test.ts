import { readFileSync } from 'fs'
import { resolve } from 'path'
import * as pgPromise from 'pg-promise'
import { linkMarket, unlinkMarket } from 'api/link-market'
import { APIError } from 'common/api/utils'
import { Contract } from 'common/contract'
import { getLinkParentError } from 'common/market-links'
import {
  createSupabaseDirectClient,
  SupabaseDirectClientTimeout,
  SupabaseTransaction,
} from './supabase/init'
import {
  getLinkParentCandidate,
  getMarketLinksForFeed,
  lockMarketLinkContracts,
  lockMarketLinkFundingUser,
  upsertMarketLink,
} from './supabase/market-links'
import { getContract } from './utils'

// Opt-in, disposable LOCAL database only. The harness creates the database in
// an ephemeral PostgreSQL container; normal CI skips this suite. Never point
// this at an existing app database: its minimal public fixture is truncated.
// MARKET_LINKS_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:<port>/pr4134_races
// yarn --cwd backend/shared test --runInBand market-links-postgres
const databaseUrl = process.env.MARKET_LINKS_TEST_DATABASE_URL
if (databaseUrl) {
  const target = new URL(databaseUrl)
  if (
    !['postgres:', 'postgresql:'].includes(target.protocol) ||
    target.hostname !== '127.0.0.1' ||
    target.pathname !== '/pr4134_races' ||
    !target.port ||
    target.search ||
    target.username !== 'postgres'
  ) {
    throw new Error(
      'This suite requires the disposable loopback pr4134_races DB'
    )
  }
}
const describeLocalPostgres = databaseUrl ? describe : describe.skip

// Keep the actual handlers, SQL helpers and validators. Only service/auth
// boundaries and the minimal contract-row adapter are replaced.
jest.mock('api/helpers/rate-limit', () => ({
  onlyUsersWhoCanPerformAction: (_action: string, handler: unknown) => handler,
}))
jest.mock('./supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(),
}))
jest.mock('./utils', () => ({ getContract: jest.fn() }))
jest.mock('common/envs/constants', () => ({
  ...jest.requireActual('common/envs/constants'),
  isModId: () => false,
  isAdminId: () => false,
}))

type Handler = (props: unknown, auth: { uid: string }) => Promise<unknown>
const link = linkMarket as unknown as Handler
const unlink = unlinkMarket as unknown as Handler
const pgp = pgPromise()
// Match the app's timestamptz text parser.
pgp.pg.types.setTypeParser(1184, (value) => value)
const WAIT_LIMIT_MS = 10_000

function deferred() {
  let resolvePromise!: () => void
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve
  })
  return { promise, resolve: resolvePromise }
}

type Gate = {
  reached: ReturnType<typeof deferred>
  release: ReturnType<typeof deferred>
}
type Result = { ok: true; value: unknown } | { ok: false; error: unknown }

describeLocalPostgres('market-link concurrency on actual PostgreSQL', () => {
  let first: SupabaseDirectClientTimeout
  let second: SupabaseDirectClientTimeout
  let observer: SupabaseDirectClientTimeout
  let gates: Gate[]
  let pending: Promise<Result>[]
  let pauseFirstContractRead: Gate | undefined

  const newGate = () => {
    const gate = { reached: deferred(), release: deferred() }
    gates.push(gate)
    return gate
  }
  const track = (operation: Promise<unknown>) => {
    const result = operation.then<Result, Result>(
      (value) => ({ ok: true, value }),
      (error: unknown) => ({ ok: false, error })
    )
    pending.push(result)
    return result
  }
  const rows = () =>
    observer.manyOrNone<{
      child_contract_id: string
      parent_contract_id: string
    }>(
      'select child_contract_id, parent_contract_id from market_links order by child_contract_id'
    )
  const expectRejected = (result: Result) => {
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatchObject({ code: 400 })
  }

  // Observe a real blocked backend, rather than assuming a delay means that
  // two operations overlap. The DB query yields between bounded polls.
  const waitForLock = async (session: string, queryFragment: string) => {
    const started = Date.now()
    while (Date.now() - started < WAIT_LIMIT_MS) {
      const blocked = await observer.oneOrNone<{ query: string }>(
        `select query from pg_stat_activity
         where application_name = $1 and wait_event_type = 'Lock'`,
        [session]
      )
      if (blocked) {
        expect(blocked.query.toLowerCase()).toContain(queryFragment)
        return
      }
    }
    throw new Error(`No PostgreSQL lock wait observed for ${session}`)
  }

  const beforeCommitClient = (
    database: SupabaseDirectClientTimeout,
    gate: Gate
  ) =>
    new Proxy(database, {
      get(target, property, receiver) {
        if (property !== 'tx') return Reflect.get(target, property, receiver)
        return (run: (tx: SupabaseTransaction) => Promise<unknown>) =>
          database.tx(async (tx) => {
            const value = await run(tx)
            gate.reached.resolve()
            await gate.release.promise
            return value
          })
      },
    })

  // Exercise the exact create-side lock/read/validate/write helper protocol.
  // This is deliberately not a full createMarketHelper/ante integration test;
  // the API unit regression separately executes that production call site.
  const createChildProtocol = (
    database: SupabaseDirectClientTimeout,
    childId: string,
    parentId: string,
    gate?: Gate
  ) =>
    database.tx(async (tx) => {
      await lockMarketLinkContracts(tx, [parentId])
      const parent = await getLinkParentCandidate(tx, parentId)
      const error = getLinkParentError(parent)
      if (error) throw new APIError(400, error)
      if (gate) {
        gate.reached.resolve()
        await gate.release.promise
      }
      await lockMarketLinkFundingUser(tx, 'owner')
      await tx.none('insert into contracts (id, creator_id) values ($1, $2)', [
        childId,
        'owner',
      ])
      await upsertMarketLink(tx, {
        childId,
        parentId,
        relation: 'prop',
        createdBy: 'owner',
      })
    })

  beforeAll(async () => {
    const database = (applicationName: string) =>
      pgp({
        connectionString: databaseUrl,
        application_name: applicationName,
        max: 2,
        statement_timeout: 15_000,
        idle_in_transaction_session_timeout: 20_000,
      })
    first = database('pr4134-first')
    second = database('pr4134-second')
    observer = database('pr4134-observer')
    await observer.none(`
      create table users (id text primary key);
      create table contracts (
        id text primary key,
        creator_id text not null references users(id),
        visibility text not null default 'public',
        deleted boolean not null default false,
        resolution text,
        close_time timestamptz default now() + interval '1 day',
        token text not null default 'MANA',
        outcome_type text not null default 'BINARY',
        importance_score numeric default 1
      );
    `)
    await observer.none(
      readFileSync(
        resolve(
          __dirname,
          '../../supabase/migrations/2026101901_market_links.sql'
        ),
        'utf8'
      )
    )
  })

  beforeEach(async () => {
    gates = []
    pending = []
    pauseFirstContractRead = undefined
    jest.clearAllMocks()
    await observer.none(`
      truncate contracts, users cascade;
      insert into users values ('owner'), ('old-owner'), ('new-owner');
      insert into contracts (id, creator_id) values
        ('a', 'owner'), ('b', 'owner'), ('c', 'owner'),
        ('old-parent', 'old-owner'), ('new-parent', 'new-owner');
    `)
    jest.mocked(getContract).mockImplementation(async (database, id) => {
      const row = await database.oneOrNone<{
        id: string
        creator_id: string
        visibility: string
        deleted: boolean
        session: string
      }>(
        `select id, creator_id, visibility, deleted,
           current_setting('application_name') as session
         from contracts where id = $1`,
        [id]
      )
      if (row?.session === 'pr4134-first' && pauseFirstContractRead) {
        const gate = pauseFirstContractRead
        pauseFirstContractRead = undefined
        gate.reached.resolve()
        await gate.release.promise
      }
      return row
        ? ({
            id: row.id,
            creatorId: row.creator_id,
            visibility: row.visibility,
            deleted: row.deleted,
          } as Contract)
        : undefined
    })
  })

  afterEach(async () => {
    for (const gate of gates) gate.release.resolve()
    await Promise.all(pending)
  })
  afterAll(async () => {
    await pgp.end()
  })

  const feedOptions = () => ({
    closeTimeFrom: Date.now() - 18 * 60 * 60_000,
    closeTimeTo: Date.now() + 45 * 24 * 60 * 60_000,
    limitPerParent: 3,
    outcomeTypes: ['BINARY' as const],
  })

  it('filters ineligible linked children before applying a deterministic per-parent cap', async () => {
    await observer.none(`
      insert into contracts (id, creator_id, importance_score)
      select 'valid-' || i, 'owner', 1 from generate_series(0, 29) i;
      insert into market_links (child_contract_id, parent_contract_id, created_by)
      select id, 'a', 'owner' from contracts where id like 'valid-%';
      insert into contracts (id, creator_id, importance_score) values
        ('resolved', 'owner', 100), ('old', 'owner', 100),
        ('far', 'owner', 100), ('private', 'owner', 100),
        ('deleted', 'owner', 100), ('poll', 'owner', 100),
        ('cash', 'owner', 100), ('no-date', 'owner', 100),
        ('live', 'owner', 2);
      insert into market_links (child_contract_id, parent_contract_id, created_by)
      select id, 'a', 'owner' from contracts where importance_score >= 2;
      update contracts set resolution = 'YES' where id = 'resolved';
      update contracts set close_time = now() - interval '19 hours' where id = 'old';
      update contracts set close_time = now() + interval '46 days' where id = 'far';
      update contracts set close_time = now() - interval '1 hour' where id = 'live';
      update contracts set close_time = null where id = 'no-date';
      update contracts set visibility = 'unlisted' where id = 'private';
      update contracts set deleted = true where id = 'deleted';
      update contracts set outcome_type = 'POLL' where id = 'poll';
      update contracts set token = 'CASH' where id = 'cash';
      insert into market_links (child_contract_id, parent_contract_id, created_by)
      values ('c', 'b', 'owner');
    `)
    const result = await getMarketLinksForFeed(
      first,
      ['a', 'b'],
      ['valid-0', 'old', 'c'],
      feedOptions()
    )
    // No topic assignment is needed: the explicit parent supplies relevance.
    expect(result.linked.map((c) => [c.parentId, c.id])).toEqual([
      ['a', 'live'],
      ['a', 'valid-0'],
      ['a', 'valid-1'],
      ['b', 'c'],
    ])
    expect([...result.withParents].sort()).toEqual(['c', 'old', 'valid-0'])
    expect(await getMarketLinksForFeed(first, [], [], feedOptions())).toEqual({
      linked: [],
      withParents: new Set(),
    })
  })

  it('keeps explicit children and exclusions in one snapshot across a concurrent reparent', async () => {
    await observer.none(`insert into market_links
      (child_contract_id, parent_contract_id, created_by) values ('c', 'a', 'owner')`)
    // A test-only advisory barrier blocks inside the actual SELECT, after
    // PostgreSQL takes its statement snapshot. Commit the reparent meanwhile.
    const gatedReader = new Proxy(first, {
      get(target, property, receiver) {
        if (property !== 'one') return Reflect.get(target, property, receiver)
        return (query: string, values: unknown[]) =>
          first.one(
            query
              .replace(
                'with eligible_links as (',
                'with barrier as materialized (select pg_advisory_xact_lock(413405)), eligible_links as ('
              )
              .replace('as parent(id)', 'as parent(id) cross join barrier'),
            values
          )
      },
    })
    let reading: ReturnType<typeof getMarketLinksForFeed> | undefined
    await observer.tx(async (tx) => {
      await tx.one('select pg_advisory_xact_lock(413405)')
      reading = getMarketLinksForFeed(
        gatedReader,
        ['a', 'b'],
        ['c'],
        feedOptions()
      )
      track(reading)
      await waitForLock('pr4134-first', 'with barrier')
      jest.mocked(createSupabaseDirectClient).mockReturnValueOnce(second)
      await link({ contractId: 'c', parentContractId: 'b' }, { uid: 'owner' })
    })
    const snapshot = await reading!
    expect(snapshot.linked).toEqual([
      { id: 'c', parentId: 'a', relation: 'related' },
    ])
    expect([...snapshot.withParents]).toEqual(['c'])
    const fresh = await getMarketLinksForFeed(
      first,
      ['a', 'b'],
      ['c'],
      feedOptions()
    )
    expect(fresh.linked).toEqual([
      { id: 'c', parentId: 'b', relation: 'related' },
    ])
    expect([...fresh.withParents]).toEqual(['c'])
  })

  it.each([
    ['opposing links', 'a', 'b', 'b', 'a'],
    ['a child later gaining a child', 'a', 'b', 'c', 'a'],
    ['a parent later becoming a child', 'a', 'b', 'b', 'c'],
  ])('serializes %s and refuses the forbidden graph', async (_, a, b, c, d) => {
    const gate = newGate()
    pauseFirstContractRead = gate
    jest
      .mocked(createSupabaseDirectClient)
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second)
    const winning = track(
      link({ contractId: a, parentContractId: b }, { uid: 'owner' })
    )
    await gate.reached.promise
    const losing = track(
      link({ contractId: c, parentContractId: d }, { uid: 'owner' })
    )
    await waitForLock('pr4134-second', 'for no key update')
    gate.release.resolve()
    expect((await winning).ok).toBe(true)
    expectRejected(await losing)
    expect(await rows()).toEqual([
      { child_contract_id: a, parent_contract_id: b },
    ])
  })

  it('allows two concurrent children of the same parent without an FK deadlock', async () => {
    const gate = newGate()
    pauseFirstContractRead = gate
    jest
      .mocked(createSupabaseDirectClient)
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second)
    const one = track(
      link({ contractId: 'a', parentContractId: 'c' }, { uid: 'owner' })
    )
    await gate.reached.promise
    const two = track(
      link({ contractId: 'b', parentContractId: 'c' }, { uid: 'owner' })
    )
    await waitForLock('pr4134-second', 'for no key update')
    gate.release.resolve()
    expect((await one).ok).toBe(true)
    expect((await two).ok).toBe(true)
    expect(await rows()).toEqual([
      { child_contract_id: 'a', parent_contract_id: 'c' },
      { child_contract_id: 'b', parent_contract_id: 'c' },
    ])
  })

  it.each(['old-owner', 'owner'])(
    'rechecks a waiting DELETE by %s and reports conflict after reparenting',
    async (uid) => {
      await observer.none(`insert into market_links
      (child_contract_id, parent_contract_id, created_by)
      values ('a', 'old-parent', 'owner')`)
      const gate = newGate()
      jest
        .mocked(createSupabaseDirectClient)
        .mockReturnValueOnce(beforeCommitClient(first, gate))
        .mockReturnValueOnce(second)
      const replacing = track(
        link(
          { contractId: 'a', parentContractId: 'new-parent' },
          { uid: 'owner' }
        )
      )
      await gate.reached.promise
      const removing = track(unlink({ contractId: 'a' }, { uid }))
      await waitForLock('pr4134-second', 'delete from market_links')
      gate.release.resolve()
      expect((await replacing).ok).toBe(true)
      const removed = await removing
      expect(removed.ok).toBe(false)
      if (!removed.ok) expect(removed.error).toMatchObject({ code: 409 })
      expect(await rows()).toEqual([
        { child_contract_id: 'a', parent_contract_id: 'new-parent' },
      ])
    }
  )

  it('a create-side parent lock makes a competing link reread the new child', async () => {
    const gate = newGate()
    const creating = track(createChildProtocol(first, 'new-child', 'b', gate))
    await gate.reached.promise
    jest.mocked(createSupabaseDirectClient).mockReturnValueOnce(second)
    const reparenting = track(
      link({ contractId: 'b', parentContractId: 'c' }, { uid: 'owner' })
    )
    await waitForLock('pr4134-second', 'for no key update')
    gate.release.resolve()
    expect((await creating).ok).toBe(true)
    expectRejected(await reparenting)
    expect(await rows()).toEqual([
      { child_contract_id: 'new-child', parent_contract_id: 'b' },
    ])
  })

  it('create-side validation sees a reparent committed while it waited', async () => {
    expect(
      getLinkParentError(await getLinkParentCandidate(second, 'b'))
    ).toBeUndefined()
    const gate = newGate()
    pauseFirstContractRead = gate
    jest.mocked(createSupabaseDirectClient).mockReturnValueOnce(first)
    const reparenting = track(
      link({ contractId: 'b', parentContractId: 'c' }, { uid: 'owner' })
    )
    await gate.reached.promise
    const creating = track(createChildProtocol(second, 'new-child', 'b'))
    await waitForLock('pr4134-second', 'for no key update')
    gate.release.resolve()
    expect((await reparenting).ok).toBe(true)
    expectRejected(await creating)
    expect(await rows()).toEqual([
      { child_contract_id: 'b', parent_contract_id: 'c' },
    ])
  })

  it.each([
    ["close_time = now() - interval '1 minute'"],
    ["visibility = 'unlisted'"],
    ["resolution = 'YES'"],
  ])(
    'create-side validation rereads parent mutation %s after waiting',
    async (mutation) => {
      expect(
        getLinkParentError(await getLinkParentCandidate(second, 'b'))
      ).toBeUndefined()
      const gate = newGate()
      const changing = track(
        first.tx(async (tx) => {
          await tx.none(`update contracts set ${mutation} where id = 'b'`)
          gate.reached.resolve()
          await gate.release.promise
        })
      )
      await gate.reached.promise
      const creating = track(createChildProtocol(second, 'new-child', 'b'))
      await waitForLock('pr4134-second', 'for no key update')
      gate.release.resolve()
      expect((await changing).ok).toBe(true)
      expectRejected(await creating)
      expect(await rows()).toEqual([])
      expect(
        await observer.oneOrNone(
          "select id from contracts where id = 'new-child'"
        )
      ).toBeNull()
    }
  )

  it('a create-side lock holds parent updates until the child/link transaction commits', async () => {
    const gate = newGate()
    const creating = track(createChildProtocol(first, 'new-child', 'b', gate))
    await gate.reached.promise
    const changing = track(
      second.none("update contracts set visibility = 'unlisted' where id = 'b'")
    )
    await waitForLock('pr4134-second', 'update contracts')
    gate.release.resolve()
    expect((await creating).ok).toBe(true)
    expect((await changing).ok).toBe(true)
    expect(await rows()).toEqual([
      { child_contract_id: 'new-child', parent_contract_id: 'b' },
    ])
  })

  it('payer contention aborts before creation writes, frees the parent, and permits a fresh retry', async () => {
    // Resolution holds payer U then wants parent P. Creation already holds P
    // then checks U. A blocking U lock would form a real database deadlock;
    // NOWAIT must instead return 55P03 and roll back before any child write.
    const resolver = newGate()
    const creator = newGate()
    const resolving = track(
      second.tx(async (tx) => {
        await tx.one(
          "select id from users where id = 'owner' for no key update"
        )
        resolver.reached.resolve()
        await resolver.release.promise
        await tx.none("update contracts set resolution = 'YES' where id = 'b'")
      })
    )
    await resolver.reached.promise
    const creating = track(
      createChildProtocol(first, 'new-child', 'b', creator)
    )
    await creator.reached.promise
    resolver.release.resolve()
    await waitForLock('pr4134-second', 'update contracts')
    creator.release.resolve()

    const creationResult = await creating
    expect(creationResult.ok).toBe(false)
    if (!creationResult.ok)
      expect(creationResult.error).toMatchObject({ code: '55P03' })
    expect((await resolving).ok).toBe(true)
    expect(await rows()).toEqual([])
    expect(
      await observer.oneOrNone(
        "select id from contracts where id = 'new-child'"
      )
    ).toBeNull()

    // The API owns its bounded retry policy. Exercise the same transaction
    // protocol again: its fresh parent read must see the committed resolution.
    expectRejected(await track(createChildProtocol(first, 'new-child', 'b')))
    expect(await rows()).toEqual([])
  })
})

jest.setTimeout(30_000)
