// hide-comment, pin-comment, edit-comment and award-bounty are each given a
// market id and a comment id. Each checks the caller against that market (its
// creator may hide and pin, its rules decide who may comment, its creator
// awards its bounty) and then acts on the comment, which it looks up by
// comment id alone. Nothing tied the two together, so the creator of any
// market could name their own market with a comment from someone else's, and
// hide it, pin it or mark it with a bounty there.
//
// Each handler now refuses a comment that is not on the market it was given.
//
// The real handlers run here. The comments are rows in an in-memory
// PostgreSQL, read and written by the handlers' own SQL (getComment,
// updateData, the edit log), in a real transaction where the handler opens
// one. No comment here has a post on Yap. Markets and users are in-memory
// stand-ins, and the bounty payout itself is a stand-in. No live database or
// network is used.
import { PGlite } from '@electric-sql/pglite'

jest.mock('api/helpers/endpoint', () => ({
  APIError:
    jest.requireActual<typeof import('common/api/utils')>('common/api/utils')
      .APIError,
}))
jest.mock('api/helpers/rate-limit', () => ({
  onlyUsersWhoCanPerformAction: (_action: string, handler: unknown) => handler,
}))
jest.mock('api/on-create-comment-on-contract', () => ({
  onCreateCommentOnContract: jest.fn(),
}))
jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(),
  // updateData builds its SQL with the client library, as in production.
  pgp: jest.requireActual<typeof import('pg-promise')>('pg-promise')(),
}))
jest.mock('shared/utils', () => ({
  getContract: jest.fn(),
  getUser: jest.fn(),
  revalidateContractStaticProps: jest.fn(),
  revalidateStaticProps: jest.fn(),
  sanitizeJsonContent: (content: unknown) => content,
  log: Object.assign(jest.fn(), { warn: jest.fn(), error: jest.fn() }),
}))
jest.mock('shared/analytics', () => ({ trackPublicEvent: jest.fn() }))
jest.mock('shared/new-account-gate', () => ({
  passesNewAccountGate: jest.fn(async () => true),
  newAccountGateMessage: jest.fn(),
}))
jest.mock('shared/tiptap', () => ({ anythingToRichText: jest.fn() }))
jest.mock('shared/txn/run-txn', () => ({ runTxnInBetQueue: jest.fn() }))
jest.mock('shared/websockets/helpers', () => ({
  broadcastNewComment: jest.fn(),
}))
jest.mock('shared/bounty', () => ({ awardBounty: jest.fn() }))
jest.mock('shared/create-notification', () => ({
  createBountyAwardedNotification: jest.fn(),
}))

import { awardBounty } from 'api/award-bounty'
import { editComment } from 'api/edit-comment'
import type { AuthedUser } from 'api/helpers/endpoint'
import { hideComment } from 'api/hide-comment'
import { pinComment } from 'api/pin-comment'
import { API } from 'common/api/schema'
import { ContractComment } from 'common/comment'
import { Contract } from 'common/contract'
import { ENV_CONFIG, isAdminId, MOD_IDS } from 'common/envs/constants'
import { Txn } from 'common/txn'
import { User } from 'common/user'
import { trackPublicEvent } from 'shared/analytics'
import { awardBounty as payBounty } from 'shared/bounty'
import { createBountyAwardedNotification } from 'shared/create-notification'
import { createSupabaseDirectClient, pgp } from 'shared/supabase/init'
import {
  getContract,
  getUser,
  revalidateContractStaticProps,
  revalidateStaticProps,
} from 'shared/utils'

jest.setTimeout(60_000)

const CREATOR_A = 'creator-a'
const CREATOR_B = 'creator-b'
const COMMENTER = 'commenter'
const ADMIN = ENV_CONFIG.adminIds[0]
// A moderator who is not also an admin: moderators hide, pin and delete, only
// admins edit other people's comments.
const MOD = MOD_IDS.find((id) => !isAdminId(id)) as string

const WRONG_MARKET = {
  code: 400,
  message: 'Comment does not belong to this market',
}

const market = (id: string, creatorId: string) =>
  ({
    id,
    slug: id,
    creatorId,
    creatorUsername: creatorId,
    token: 'MANA',
    visibility: 'public',
  } as unknown as Contract)
const markets: { [id: string]: Contract } = {
  'market-a': market('market-a', CREATOR_A),
  'market-b': market('market-b', CREATOR_B),
}

const doc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})
// One comment on each market, both by the same commenter.
const comment = (id: string, contractId: string) =>
  ({
    id,
    contractId,
    userId: COMMENTER,
    userName: COMMENTER,
    userUsername: COMMENTER,
    commentType: 'contract',
    contractSlug: contractId,
    contractQuestion: contractId,
    content: doc('As first written'),
    createdTime: 1_700_000_000_000,
    visibility: 'public',
  } as ContractComment)

type Row = { [column: string]: unknown }
let db: PGlite

const rows = async (sql: string, params?: unknown) =>
  (await db.query<Row>(pgp.as.format(sql, params))).rows

// The parts of pg-promise the four handlers use, on one connection.
// pg-promise formats the placeholders as it does in production; PGlite
// executes the result.
const client = {
  oneOrNone: async <T>(
    sql: string,
    params?: unknown,
    map?: (row: Row | null) => T
  ) => {
    const result = await rows(sql, params)
    if (result.length > 1) throw new Error('Multiple rows were not expected.')
    const row = result[0] ?? null
    return map ? map(row) : row
  },
  one: async (sql: string, params?: unknown) => {
    const result = await rows(sql, params)
    if (result.length !== 1) throw new Error('No data returned from the query.')
    return result[0]
  },
  none: async (sql: string, params?: unknown) => {
    await rows(sql, params)
  },
  // One transaction: what the handler wrote is undone if it throws.
  tx: async (...args: unknown[]) => {
    const run = args[args.length - 1] as (tx: unknown) => Promise<unknown>
    await db.exec('begin')
    try {
      const result = await run(client)
      await db.exec('commit')
      return result
    } catch (error) {
      await db.exec('rollback')
      throw error
    }
  },
}

// Every comment row, whole: a refused call must leave all of it as it was.
const stored = () =>
  rows(
    `select contract_id, comment_id, user_id, visibility, likes, dislikes,
      created_time, data
    from contract_comments order by contract_id, comment_id`
  )
const dataOf = async (commentId: string) =>
  (
    await rows(`select data from contract_comments where comment_id = $1`, [
      commentId,
    ])
  )[0].data as ContractComment
const editLog = () =>
  rows(
    `select contract_id, comment_id, editor_id, data
    from contract_comment_edits order by id`
  )

const as = (uid: string) =>
  ({ uid, creds: { kind: 'jwt' } } as unknown as AuthedUser)
const req = {} as never
const path = (marketId: string, commentId: string) =>
  `contracts/${marketId}/comments/${commentId}`

const hide = (
  uid: string,
  marketId: string,
  commentId: string,
  action?: 'hide' | 'delete'
) =>
  hideComment(
    API['hide-comment'].props.parse({
      commentPath: path(marketId, commentId),
      action,
    }),
    as(uid),
    req
  )
const pin = (uid: string, marketId: string, commentId: string) =>
  pinComment(
    API['pin-comment'].props.parse({ commentPath: path(marketId, commentId) }),
    as(uid),
    req
  )
const edit = (uid: string, marketId: string, commentId: string) =>
  editComment(
    API['edit-comment'].props.parse({
      contractId: marketId,
      commentId,
      content: doc('Edited'),
    }),
    as(uid),
    req
  )
const award = (uid: string, marketId: string, commentId: string) =>
  awardBounty(
    API['market/:contractId/award-bounty'].props.parse({
      contractId: marketId,
      commentId,
      amount: 25,
    }),
    as(uid),
    req
  )

// The work a handler leaves for after its response (the audit event).
const finish = async (response: unknown) => {
  if (response && typeof response === 'object' && 'continue' in response)
    await (response as { continue: () => Promise<void> }).continue()
}

// Refused as a comment from another market, and nothing was written, logged,
// revalidated, paid or notified.
const expectRefusedUntouched = async (call: () => Promise<unknown>) => {
  const before = await stored()
  await expect(call()).rejects.toMatchObject(WRONG_MARKET)
  expect(await stored()).toEqual(before)
  expect(await editLog()).toEqual([])
  expect(revalidateContractStaticProps).not.toHaveBeenCalled()
  expect(revalidateStaticProps).not.toHaveBeenCalled()
  expect(trackPublicEvent).not.toHaveBeenCalled()
  expect(payBounty).not.toHaveBeenCalled()
  expect(createBountyAwardedNotification).not.toHaveBeenCalled()
}

// The other market's comment is exactly as it was.
const expectOtherUntouched = async (commentId: string, before: Row[]) => {
  const now = (await stored()).find((row) => row.comment_id === commentId)
  expect(now).toEqual(before.find((row) => row.comment_id === commentId))
}

beforeAll(async () => {
  db = new PGlite()
  // contract_comments as backend/supabase/contract_comments.sql defines it,
  // with the trigger that fills its columns from data, the edit log, and
  // the part of social_posts the handlers read.
  await db.exec(`
    create function millis_to_ts (millis bigint) returns timestamptz
      language sql immutable as
      $$ select to_timestamp(millis / 1000.0) $$;
    create table contract_comments (
      comment_id text not null,
      contract_id text not null,
      created_time timestamptz not null,
      data jsonb not null,
      dislikes integer default 0,
      likes integer default 0 not null,
      user_id text not null,
      visibility text,
      primary key (contract_id, comment_id)
    );
    create function comment_populate_cols () returns trigger
      language plpgsql as $$ begin
        if new.data is not null then
          new.visibility := (new.data)->>'visibility';
          new.user_id := (new.data)->>'userId';
          new.created_time := case
            when new.data ? 'createdTime'
              then millis_to_ts(((new.data)->>'createdTime')::bigint)
            else null
          end;
        end if;
        return new;
      end $$;
    create trigger comment_populate before insert or update
      on contract_comments for each row
      execute function comment_populate_cols ();
    create table contract_comment_edits (
      comment_id text not null,
      contract_id text not null,
      created_time timestamptz default now() not null,
      data jsonb not null,
      editor_id text not null,
      id serial not null
    );
    -- The columns hide-comment and edit-comment use when they look for the
    -- comment's post on Yap. The table stays empty here.
    create table social_posts (
      id text primary key,
      market_comment_id text,
      hidden_time timestamptz,
      deleted_time timestamptz
    );
  `)
})

afterAll(async () => {
  await db.close()
})

beforeEach(async () => {
  jest.clearAllMocks()
  await db.exec(
    `truncate contract_comments; truncate contract_comment_edits;
    truncate social_posts;`
  )
  for (const c of [comment('on-a', 'market-a'), comment('on-b', 'market-b')])
    await rows(
      `insert into contract_comments (contract_id, comment_id, data)
      values ($1, $2, $3)`,
      [c.contractId, c.id, c]
    )
  jest
    .mocked(createSupabaseDirectClient)
    .mockReturnValue(
      client as unknown as ReturnType<typeof createSupabaseDirectClient>
    )
  jest
    .mocked(getContract)
    .mockImplementation(async (_pg, contractId) => markets[contractId])
  jest
    .mocked(getUser)
    .mockImplementation(async (id) => ({ id, createdTime: 0 } as User))
})

test('the fixtures: a moderator who is not an admin, an admin, and one comment on each market', async () => {
  expect(MOD).toBeTruthy()
  expect(ADMIN).toBeTruthy()
  expect(
    (await stored()).map((row) => [row.contract_id, row.comment_id])
  ).toEqual([
    ['market-a', 'on-a'],
    ['market-b', 'on-b'],
  ])
})

describe('hide-comment', () => {
  test("refuses the creator of one market hiding a comment that is on someone else's", async () => {
    await expectRefusedUntouched(() => hide(CREATOR_A, 'market-a', 'on-b'))
  })

  test("refuses a moderator and an admin too, for hide and for delete, when the market named is not the comment's", async () => {
    await expectRefusedUntouched(() => hide(MOD, 'market-a', 'on-b'))
    await expectRefusedUntouched(() => hide(MOD, 'market-a', 'on-b', 'delete'))
    await expectRefusedUntouched(() => hide(ADMIN, 'market-a', 'on-b'))
    await expectRefusedUntouched(() =>
      hide(ADMIN, 'market-a', 'on-b', 'delete')
    )
  })

  test('the creator still hides and unhides a comment on their own market', async () => {
    const before = await stored()
    const response = await hide(CREATOR_A, 'market-a', 'on-a')
    expect(response).toMatchObject({ result: { success: true } })
    expect(await dataOf('on-a')).toMatchObject({
      hidden: true,
      hiderId: CREATOR_A,
      hiddenTime: expect.any(Number),
    })
    await expectOtherUntouched('on-b', before)
    expect(revalidateContractStaticProps).toHaveBeenCalledWith(
      markets['market-a']
    )
    await finish(response)
    expect(trackPublicEvent).toHaveBeenCalledWith(CREATOR_A, 'hide_comment', {
      contractId: 'market-a',
      commentId: 'on-a',
      hidden: true,
      userId: CREATOR_A,
    })

    await hide(CREATOR_A, 'market-a', 'on-a')
    expect(await dataOf('on-a')).toMatchObject({
      hidden: false,
      hiderId: CREATOR_A,
    })
    await expectOtherUntouched('on-b', before)
  })

  test('a moderator still hides and deletes a comment through its own market', async () => {
    const before = await stored()
    await hide(MOD, 'market-b', 'on-b')
    expect(await dataOf('on-b')).toMatchObject({ hidden: true, hiderId: MOD })
    await hide(MOD, 'market-b', 'on-b', 'delete')
    expect(await dataOf('on-b')).toMatchObject({
      deleted: true,
      deleterId: MOD,
      deletedTime: expect.any(Number),
    })
    await expectOtherUntouched('on-a', before)
  })

  test("someone who is not the market's creator, an admin or a moderator is still refused first", async () => {
    const before = await stored()
    await expect(hide(CREATOR_A, 'market-b', 'on-b')).rejects.toMatchObject({
      code: 403,
    })
    await expect(
      hide(CREATOR_A, 'market-a', 'on-a', 'delete')
    ).rejects.toMatchObject({ code: 403 })
    // Whichever market the comment is on: who may act is settled before the
    // comment is looked at.
    await expect(hide(CREATOR_A, 'market-b', 'on-a')).rejects.toMatchObject({
      code: 403,
    })
    await expect(
      hide(CREATOR_A, 'market-a', 'on-b', 'delete')
    ).rejects.toMatchObject({ code: 403 })
    expect(await stored()).toEqual(before)
  })
})

describe('pin-comment', () => {
  test("refuses the creator of one market pinning a comment that is on someone else's", async () => {
    await expectRefusedUntouched(() => pin(CREATOR_A, 'market-a', 'on-b'))
  })

  test("refuses a moderator and an admin too when the market named is not the comment's", async () => {
    await expectRefusedUntouched(() => pin(MOD, 'market-a', 'on-b'))
    await expectRefusedUntouched(() => pin(ADMIN, 'market-a', 'on-b'))
  })

  test('the creator still pins and unpins a comment on their own market', async () => {
    const before = await stored()
    await pin(CREATOR_A, 'market-a', 'on-a')
    expect(await dataOf('on-a')).toMatchObject({
      pinned: true,
      pinnerId: CREATOR_A,
      pinnedTime: expect.any(Number),
    })
    await expectOtherUntouched('on-b', before)
    expect(revalidateContractStaticProps).toHaveBeenCalledWith(
      markets['market-a']
    )

    await pin(CREATOR_A, 'market-a', 'on-a')
    expect(await dataOf('on-a')).toMatchObject({
      pinned: false,
      pinnerId: CREATOR_A,
    })
    await expectOtherUntouched('on-b', before)
  })

  test('a moderator still pins a comment through its own market, and anyone else is still refused first', async () => {
    const before = await stored()
    await pin(MOD, 'market-b', 'on-b')
    expect(await dataOf('on-b')).toMatchObject({ pinned: true, pinnerId: MOD })
    await expectOtherUntouched('on-a', before)
    await expect(pin(CREATOR_B, 'market-a', 'on-a')).rejects.toMatchObject({
      code: 403,
    })
    await expectOtherUntouched('on-a', before)
    // Whichever market the comment is on: who may act is settled first.
    const pinned = await stored()
    await expect(pin(CREATOR_B, 'market-a', 'on-b')).rejects.toMatchObject({
      code: 403,
    })
    expect(await stored()).toEqual(pinned)
  })
})

describe('edit-comment', () => {
  test("refuses an edit made under another market's name, even by the comment's own author", async () => {
    // The market named, not the comment's own, would set the commenting rules
    // for the edit, and the edit would be logged and revalidated under it.
    await expectRefusedUntouched(() => edit(COMMENTER, 'market-a', 'on-b'))
  })

  test("refuses an admin too when the market named is not the comment's", async () => {
    await expectRefusedUntouched(() => edit(ADMIN, 'market-a', 'on-b'))
  })

  test("the author still edits their comment on the comment's own market", async () => {
    const before = await stored()
    const original = await dataOf('on-b')
    expect(await edit(COMMENTER, 'market-b', 'on-b')).toEqual({ success: true })
    expect(await dataOf('on-b')).toMatchObject({
      content: doc('Edited'),
      editedTime: expect.any(Number),
    })
    // The version it replaced, logged under the comment's own market.
    expect(await editLog()).toEqual([
      {
        contract_id: 'market-b',
        comment_id: 'on-b',
        editor_id: COMMENTER,
        data: original,
      },
    ])
    expect(revalidateStaticProps).toHaveBeenCalledWith('/creator-b/market-b')
    await expectOtherUntouched('on-a', before)
  })

  test('an admin still edits it there, and nobody else does', async () => {
    const before = await stored()
    await expect(edit(CREATOR_B, 'market-b', 'on-b')).rejects.toMatchObject({
      code: 403,
    })
    await expect(edit(MOD, 'market-b', 'on-b')).rejects.toMatchObject({
      code: 403,
    })
    expect(await stored()).toEqual(before)
    expect(await editLog()).toEqual([])

    await edit(ADMIN, 'market-b', 'on-b')
    expect(await dataOf('on-b')).toMatchObject({ content: doc('Edited') })
    expect(await editLog()).toMatchObject([
      { contract_id: 'market-b', comment_id: 'on-b', editor_id: ADMIN },
    ])
  })
})

describe('award-bounty', () => {
  test("refuses a bounty for a comment that is on someone else's market", async () => {
    // Nothing reaches the payout: no mana moves, the comment is not marked and
    // its author is not notified.
    await expectRefusedUntouched(() => award(CREATOR_A, 'market-a', 'on-b'))
  })

  test("a comment on the bounty's own market is still awarded", async () => {
    const txn = { id: 'txn', amount: 25 } as unknown as Txn
    jest
      .mocked(payBounty)
      .mockResolvedValue(txn as Awaited<ReturnType<typeof payBounty>>)
    expect(await award(CREATOR_A, 'market-a', 'on-a')).toBe(txn)
    expect(payBounty).toHaveBeenCalledWith({
      contractId: 'market-a',
      fromUserId: CREATOR_A,
      toUserId: COMMENTER,
      commentId: 'on-a',
      prevBountyAwarded: undefined,
      amount: 25,
    })
    expect(createBountyAwardedNotification).toHaveBeenCalledWith(
      COMMENTER,
      markets['market-a'],
      'market-a',
      25
    )
  })
})
