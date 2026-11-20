// A bet can be placed as a reply to a comment: the bet button under a comment
// sends the comment's id along with the bet. Once the bet is written,
// on-create-bet adds up the bets that reply to that comment, writes the totals
// onto the comment and tells the comment's author. It looked the comment up by
// comment id alone, so a bet on one market could name a comment on another.
// That comment's totals were then replaced with the first market's bets, and
// its author was told about a bet on a market the comment is not on.
//
// A reply now counts only when its comment is on the bet's market or on that
// market's sibling: comments are kept on the mana market, and a bet on the
// cash market beside it replies to one there. The bet itself is not refused.
//
// The real onCreateBets runs here, as place-bet runs it after writing a bet.
// The comments and bets are rows in an in-memory PostgreSQL, read and written
// by the handler's own SQL (getCommentSafe, getBetsRepliedToComment,
// updateData), and each bet is inserted with the statement place-bet uses.
// Markets and users are in-memory stand-ins, and so is the notification. No
// live database or network is used.
import { PGlite } from '@electric-sql/pglite'

jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(),
  // The bet insert and updateData build their SQL with the client library, as
  // in production.
  pgp: jest.requireActual<typeof import('pg-promise')>('pg-promise')(),
}))
jest.mock('shared/utils', () => ({
  getContract: jest.fn(),
  getUser: jest.fn(),
  getUsers: jest.fn(),
  revalidateContractStaticProps: jest.fn(),
  log: Object.assign(jest.fn(), { warn: jest.fn(), error: jest.fn() }),
}))
jest.mock('shared/create-notification', () => ({
  createBetReplyToCommentNotification: jest.fn(),
}))
// The rest of what onCreateBets does after a bet. None of it is under test.
jest.mock('api/helpers/debounce', () => ({ debounce: jest.fn() }))
jest.mock('api/follow-contract', () => ({ followContractInternal: jest.fn() }))
jest.mock('shared/betting-streak-bonus', () => ({
  payBettingStreak: jest.fn(),
}))
jest.mock('shared/generate-leagues', () => ({
  addToLeagueIfNotInOne: jest.fn(),
}))
jest.mock('shared/helpers/add-house-subsidy', () => ({
  addHouseSubsidy: jest.fn(),
  addHouseSubsidyToAnswer: jest.fn(),
}))
jest.mock('shared/helpers/user-contract-metrics', () => ({
  getContractMetrics: jest.fn(),
}))
jest.mock('shared/referral-bonus', () => ({ payReferralBonus: jest.fn() }))
jest.mock('shared/supabase/users', () => ({ broadcastUserUpdates: jest.fn() }))
jest.mock('shared/transact-with-retries', () => ({
  runTransactionWithRetries: jest.fn(),
}))
jest.mock('shared/websockets/helpers', () => ({
  broadcastNewBets: jest.fn(),
  broadcastOrders: jest.fn(),
  broadcastUpdatedAnswers: jest.fn(),
  broadcastUpdatedContract: jest.fn(),
  broadcastUpdatedMetrics: jest.fn(),
  broadcastUpdatedUser: jest.fn(),
}))

import { onCreateBets } from 'api/on-create-bet'
import { Bet } from 'common/bet'
import { ContractComment } from 'common/comment'
import { Contract } from 'common/contract'
import { noFees } from 'common/fees'
import { User } from 'common/user'
import { createBetReplyToCommentNotification } from 'shared/create-notification'
import { bulkInsertBetsQuery } from 'shared/supabase/bets'
import { createSupabaseDirectClient, pgp } from 'shared/supabase/init'
import { getContract } from 'shared/utils'

jest.setTimeout(60_000)

const CREATOR = 'creator'
const COMMENTER = 'commenter'
const BETTOR = 'bettor'
// Has bet before, so nothing a first bet sets off runs here.
const bettor = {
  id: BETTOR,
  name: BETTOR,
  username: BETTOR,
  lastBetTime: 1,
} as User

const market = (
  id: string,
  token: 'MANA' | 'CASH',
  siblingContractId?: string
) =>
  ({
    id,
    slug: id,
    question: id,
    creatorId: CREATOR,
    creatorUsername: CREATOR,
    mechanism: 'cpmm-1',
    outcomeType: 'BINARY',
    token,
    siblingContractId,
    visibility: 'public',
  } as unknown as Contract)
// Market A has no sibling, as most markets. Market B has a cash market
// beside it.
const markets: { [id: string]: Contract } = {
  'market-a': market('market-a', 'MANA'),
  'market-b': market('market-b', 'MANA', 'market-b-cash'),
  'market-b-cash': market('market-b-cash', 'CASH', 'market-b'),
}

const COMMENTED_AT = 1_700_000_000_000
// One comment on each mana market, both by the same commenter.
const comment = (
  id: string,
  contractId: string,
  betReplyAmountsByOutcome?: { [outcome: string]: number }
) =>
  ({
    id,
    contractId,
    userId: COMMENTER,
    userName: COMMENTER,
    userUsername: COMMENTER,
    commentType: 'contract',
    contractSlug: contractId,
    contractQuestion: contractId,
    content: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'A comment' }] },
      ],
    },
    createdTime: COMMENTED_AT,
    visibility: 'public',
    ...(betReplyAmountsByOutcome ? { betReplyAmountsByOutcome } : {}),
  } as ContractComment)

let betCount = 0
const replyBet = (
  contractId: string,
  replyToCommentId: string,
  outcome: 'YES' | 'NO',
  amount: number
): Bet => {
  betCount++
  return {
    id: `bet-${betCount}`,
    userId: BETTOR,
    contractId,
    createdTime: COMMENTED_AT + betCount * 60_000,
    amount,
    shares: amount * 2,
    outcome,
    probBefore: 0.5,
    probAfter: 0.5,
    fees: noFees,
    isRedemption: false,
    replyToCommentId,
  }
}

type Row = { [column: string]: unknown }
let db: PGlite
// Rows as the API's database client returns them (shared/supabase/init).
const parsers = {
  20: (value: string) => parseInt(value, 10),
  1700: parseFloat,
  1114: (value: string) => value,
  1184: (value: string) => value,
}

const rows = async (sql: string, params?: unknown) =>
  (await db.query<Row>(pgp.as.format(sql, params))).rows

// The parts of pg-promise the reply handling uses. pg-promise formats the
// placeholders as it does in production; PGlite executes the result.
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
  map: async <T>(sql: string, params: unknown, map: (row: Row) => T) =>
    (await rows(sql, params)).map((row) => map(row)),
}

// Every comment row, whole: a reply that does not count must leave all of it
// as it was.
const stored = () =>
  rows(
    `select contract_id, comment_id, user_id, visibility, likes, dislikes,
      created_time, data
    from contract_comments order by contract_id, comment_id`
  )
const totalsOf = async (commentId: string) =>
  (
    (
      await rows(`select data from contract_comments where comment_id = $1`, [
        commentId,
      ])
    )[0].data as ContractComment
  ).betReplyAmountsByOutcome

// What place-bet does with a bet: its transaction writes the bet row, then
// onCreateBets is run with the bets it wrote.
const place = async (bet: Bet) => {
  await db.exec(bulkInsertBetsQuery([bet]))
  await onCreateBets({
    fullBets: [bet],
    contract: markets[bet.contractId],
    user: bettor,
    cancelledLimitOrders: [],
    makers: [],
    updatedMakers: [],
    streakIncremented: false,
    bonusTxn: undefined,
    updatedMetrics: [],
    userUpdates: undefined,
    contractUpdate: undefined,
    answerUpdates: undefined,
  } as unknown as Parameters<typeof onCreateBets>[0])
  return bet
}

// The comment's author was told once, about this bet on this market.
const expectAuthorTold = (bet: Bet, commentId: string) => {
  expect(createBetReplyToCommentNotification).toHaveBeenCalledTimes(1)
  expect(createBetReplyToCommentNotification).toHaveBeenCalledWith(
    COMMENTER,
    markets[bet.contractId],
    bet,
    bettor,
    expect.objectContaining({ id: commentId }),
    client
  )
}

// The other comment is exactly as it was.
const expectOtherUntouched = async (commentId: string, before: Row[]) => {
  const now = (await stored()).find((row) => row.comment_id === commentId)
  expect(now).toEqual(before.find((row) => row.comment_id === commentId))
}

beforeAll(async () => {
  db = new PGlite({ parsers })
  // contract_comments and contract_bets as backend/supabase defines them, with
  // the triggers that fill their columns from data.
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
    create table contract_bets (
      amount numeric,
      answer_id text,
      bet_id text primary key not null,
      contract_id text not null,
      created_time timestamptz default now() not null,
      data jsonb not null,
      is_api boolean,
      is_cancelled boolean,
      is_filled boolean,
      is_redemption boolean,
      loan_amount numeric,
      outcome text,
      prob_after numeric,
      prob_before numeric,
      shares numeric,
      updated_time timestamptz default now() not null,
      user_id text not null,
      expires_at timestamptz
    );
    create function contract_bet_populate_cols () returns trigger
      language plpgsql as $$ begin
        if new.bet_id is not null then
          new.data := new.data || jsonb_build_object('id', new.bet_id);
        end if;
        new.updated_time = now();
        if new.data is not null then
          new.user_id := (new.data) ->> 'userId';
          new.amount := ((new.data) ->> 'amount')::numeric;
          new.shares := ((new.data) ->> 'shares')::numeric;
          new.outcome := ((new.data) ->> 'outcome');
          new.prob_before := ((new.data) ->> 'probBefore')::numeric;
          new.prob_after := ((new.data) ->> 'probAfter')::numeric;
          new.is_redemption := ((new.data) -> 'isRedemption')::boolean;
          new.answer_id := ((new.data) ->> 'answerId')::text;
          new.is_api := ((new.data) ->> 'isApi')::boolean;
          new.loan_amount := ((new.data) ->> 'loanAmount')::numeric;
          new.is_filled := ((new.data) ->> 'isFilled')::boolean;
          new.is_cancelled := ((new.data) ->> 'isCancelled')::boolean;
        end if;
        return new;
      end $$;
    create trigger contract_bet_populate before insert or update
      on contract_bets for each row
      execute function contract_bet_populate_cols ();
  `)
})

afterAll(async () => {
  await db.close()
})

beforeEach(async () => {
  jest.clearAllMocks()
  betCount = 0
  await db.exec(`truncate contract_comments; truncate contract_bets;`)
  // Nobody has replied to the comment on market A with a bet. The comment on
  // market B has two such replies, M$40 on YES on its own market and 15 on NO
  // on the cash market beside it, and the totals they left on it.
  for (const c of [
    comment('on-a', 'market-a'),
    comment('on-b', 'market-b', { YES: 40, NO: 15 }),
  ])
    await rows(
      `insert into contract_comments (contract_id, comment_id, data)
      values ($1, $2, $3)`,
      [c.contractId, c.id, c]
    )
  await db.exec(
    bulkInsertBetsQuery([
      replyBet('market-b', 'on-b', 'YES', 40),
      replyBet('market-b-cash', 'on-b', 'NO', 15),
    ])
  )
  jest
    .mocked(createSupabaseDirectClient)
    .mockReturnValue(
      client as unknown as ReturnType<typeof createSupabaseDirectClient>
    )
  jest
    .mocked(getContract)
    .mockImplementation(async (_pg, contractId) => markets[contractId])
})

test('the fixtures: one comment on each mana market, and two earlier bets in reply to the one on market B', async () => {
  expect(
    (await stored()).map((row) => [row.contract_id, row.comment_id])
  ).toEqual([
    ['market-a', 'on-a'],
    ['market-b', 'on-b'],
  ])
  expect(await totalsOf('on-a')).toBeUndefined()
  expect(await totalsOf('on-b')).toEqual({ YES: 40, NO: 15 })
  expect(
    await rows(
      `select contract_id, outcome, amount, data->>'replyToCommentId' as reply_to
      from contract_bets order by created_time`
    )
  ).toEqual([
    { contract_id: 'market-b', outcome: 'YES', amount: 40, reply_to: 'on-b' },
    {
      contract_id: 'market-b-cash',
      outcome: 'NO',
      amount: 15,
      reply_to: 'on-b',
    },
  ])
})

describe('a bet that names a comment on another market', () => {
  test("leaves that comment's totals as they were and tells nobody", async () => {
    // Before the check this bet's M$5 replaced the 40 and 15 on the comment,
    // and its author was told of a reply on market A.
    const before = await stored()
    await place(replyBet('market-a', 'on-b', 'YES', 5))
    expect(await stored()).toEqual(before)
    expect(createBetReplyToCommentNotification).not.toHaveBeenCalled()
  })

  test('does the same when it is on the cash market beside another market', async () => {
    const before = await stored()
    await place(replyBet('market-b-cash', 'on-a', 'NO', 5))
    expect(await stored()).toEqual(before)
    expect(createBetReplyToCommentNotification).not.toHaveBeenCalled()
  })

  test('does the same when it is a limit order that fills nothing', async () => {
    // An order that fills nothing is a bet of M$0. Before the check it set the
    // comment's totals to 0 on YES.
    const before = await stored()
    await place({
      ...replyBet('market-a', 'on-b', 'YES', 0),
      orderAmount: 1,
      limitProb: 0.01,
      isFilled: false,
      isCancelled: false,
      fills: [],
    })
    expect(await stored()).toEqual(before)
    expect(createBetReplyToCommentNotification).not.toHaveBeenCalled()
  })

  test("is not counted by a later reply on the comment's own market either", async () => {
    const stray = await place(replyBet('market-a', 'on-b', 'YES', 5))
    expect(createBetReplyToCommentNotification).not.toHaveBeenCalled()
    const reply = await place(replyBet('market-b', 'on-b', 'YES', 10))
    expect(await totalsOf('on-b')).toEqual({ YES: 50, NO: 15 })
    expectAuthorTold(reply, 'on-b')
    // The stray bet was placed all the same, and still names the comment.
    expect(
      await rows(
        `select contract_id, data->>'replyToCommentId' as reply_to
        from contract_bets where bet_id = $1`,
        [stray.id]
      )
    ).toEqual([{ contract_id: 'market-a', reply_to: 'on-b' }])
  })
})

describe("a bet on the comment's own market", () => {
  test('still sets the totals of a comment nobody had replied to, and tells its author', async () => {
    const before = await stored()
    const bet = await place(replyBet('market-a', 'on-a', 'YES', 5))
    expect(await totalsOf('on-a')).toEqual({ YES: 5 })
    expectAuthorTold(bet, 'on-a')
    await expectOtherUntouched('on-b', before)
  })

  test('still adds to totals that include bets on the cash market beside it', async () => {
    const before = await stored()
    const bet = await place(replyBet('market-b', 'on-b', 'NO', 25))
    expect(await totalsOf('on-b')).toEqual({ YES: 40, NO: 40 })
    expectAuthorTold(bet, 'on-b')
    await expectOtherUntouched('on-a', before)
  })
})

describe("a bet on the cash market beside the comment's market", () => {
  test("still adds to the comment's totals and tells its author", async () => {
    const before = await stored()
    const bet = await place(replyBet('market-b-cash', 'on-b', 'YES', 10))
    expect(await totalsOf('on-b')).toEqual({ YES: 50, NO: 15 })
    expectAuthorTold(bet, 'on-b')
    await expectOtherUntouched('on-a', before)
  })
})

test('a bet that names a comment that does not exist still writes nothing and tells nobody', async () => {
  const before = await stored()
  await place(replyBet('market-a', 'no-such-comment', 'YES', 5))
  expect(await stored()).toEqual(before)
  expect(createBetReplyToCommentNotification).not.toHaveBeenCalled()
})
