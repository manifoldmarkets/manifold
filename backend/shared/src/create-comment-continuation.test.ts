// Runs the real comment creation and continuation against a fake client.
jest.mock('./utils', () => ({
  LOCAL_ONLY: true,
  log: Object.assign(jest.fn(), { warn: jest.fn(), error: jest.fn() }),
  getUser: jest.fn(),
  getContract: jest.fn(),
  sanitizeJsonContent: (content: unknown) => content,
}))
jest.mock('./supabase/init', () => ({ createSupabaseDirectClient: jest.fn() }))
jest.mock('./supabase/utils', () => ({ updateData: jest.fn() }))
jest.mock('./new-account-gate', () => ({
  passesNewAccountGate: jest.fn(async () => true),
  newAccountGateMessage: jest.fn(),
}))
jest.mock('./websockets/helpers', () => ({ broadcastNewComment: jest.fn() }))
jest.mock('./tiptap', () => ({ anythingToRichText: jest.fn() }))
jest.mock('./txn/run-txn', () => ({ runTxnInBetQueue: jest.fn() }))
jest.mock('api/helpers/rate-limit', () => ({
  onlyUsersWhoCanPerformAction: (_action: string, handler: unknown) => handler,
}))
jest.mock('api/on-create-comment-on-contract', () => ({
  onCreateCommentOnContract: jest.fn(),
}))
jest.mock('./social-discussion', () => ({
  linkCommentToOpenDiscussion: jest.fn(async () => null),
}))
jest.mock('./social-posts', () => ({ notifySocial: jest.fn() }))

import {
  createComment,
  createCommentOnContractInternal,
} from 'api/create-comment'
import { API } from 'common/api/schema'
import { linkCommentToOpenDiscussion } from './social-discussion'
import { notifySocial, SocialRow } from './social-posts'
import { AuthedUser } from 'api/helpers/endpoint'
import { onCreateCommentOnContract } from 'api/on-create-comment-on-contract'
import { Contract } from 'common/contract'
import { User } from 'common/user'
import {
  createSupabaseDirectClient,
  SupabaseTransaction,
} from './supabase/init'
import { updateData } from './supabase/utils'
import { getContract, getUser } from './utils'
import { broadcastNewComment } from './websockets/helpers'

const creator = {
  id: 'author',
  name: 'Author',
  username: 'author',
  avatarUrl: '',
  createdTime: 0,
} as User
const contract = {
  id: 'market',
  creatorId: 'author',
  token: 'MANA',
  slug: 'market',
  question: 'Will it rain?',
  visibility: 'public',
  mechanism: 'cpmm-1',
  prob: 0.4,
} as unknown as Contract
const auth = { uid: 'author', creds: { kind: 'jwt' } } as unknown as AuthedUser
const content = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }],
}
let pg: {
  none: jest.Mock
  oneOrNone: jest.Mock
  map: jest.Mock
  one?: jest.Mock
}
let tx: { none: jest.Mock; oneOrNone: jest.Mock; one: jest.Mock }

beforeEach(() => {
  jest.clearAllMocks()
  pg = {
    none: jest.fn().mockResolvedValue(undefined),
    // The commenter's largest position.
    oneOrNone: jest
      .fn()
      .mockResolvedValue({ answer_id: null, outcome: 'YES', shares: 10 }),
    // No recent commentable bet.
    map: jest.fn().mockResolvedValue([]),
  }
  tx = {
    none: jest.fn().mockResolvedValue(undefined),
    oneOrNone: jest.fn(),
    one: jest.fn(),
  }
  jest
    .mocked(createSupabaseDirectClient)
    .mockReturnValue(
      pg as unknown as ReturnType<typeof createSupabaseDirectClient>
    )
  jest.mocked(getUser).mockResolvedValue(creator)
  jest.mocked(getContract).mockResolvedValue(contract)
})

test("in a caller's transaction, the comment is read, written and announced through it", async () => {
  const {
    result,
    announce,
    continue: next,
  } = await createCommentOnContractInternal(
    'market',
    auth,
    { content, id: 'c1', socialPostId: 'p1', isRepost: true },
    tx as unknown as SupabaseTransaction
  )
  // Validation reads use the transaction's connection, not another one.
  expect(getUser).toHaveBeenCalledWith('author', tx)
  expect(getContract).toHaveBeenCalledWith(tx, 'market')
  expect(tx.none).toHaveBeenCalledWith(
    expect.stringContaining('insert into contract_comments'),
    expect.arrayContaining(['market', 'c1'])
  )
  expect(pg.none).not.toHaveBeenCalled()
  // Not announced until the caller says its transaction has committed.
  expect(broadcastNewComment).not.toHaveBeenCalled()
  expect(result).toMatchObject({ id: 'c1', socialPostId: 'p1', isRepost: true })

  announce()
  expect(broadcastNewComment).toHaveBeenCalledTimes(1)
  // The continuation does not announce it twice.
  await next()
  expect(broadcastNewComment).toHaveBeenCalledTimes(1)
})

test('the continuation announces a comment its caller did not', async () => {
  const { continue: next } = await createCommentOnContractInternal(
    'market',
    auth,
    { content, id: 'c1' },
    tx as unknown as SupabaseTransaction
  )
  await next()
  expect(broadcastNewComment).toHaveBeenCalledTimes(1)
})

test('the continuation merges only its own fields, so later edits and moderation stand', async () => {
  const { continue: next } = await createCommentOnContractInternal(
    'market',
    auth,
    { content, id: 'c1' },
    tx as unknown as SupabaseTransaction
  )
  await next()
  expect(updateData).toHaveBeenCalledTimes(1)
  const [client, table, idField, patch] = jest.mocked(updateData).mock.calls[0]
  // A fresh client: the caller's transaction has ended by now.
  expect([client, table, idField]).toEqual([
    pg,
    'contract_comments',
    'comment_id',
  ])
  expect(patch).toMatchObject({
    comment_id: 'c1',
    commentorPositionShares: 10,
    commentorPositionOutcome: 'YES',
    commentorPositionProb: 0.4,
  })
  for (const field of ['content', 'deleted', 'hidden', 'editedTime', 'userId'])
    expect(patch).not.toHaveProperty(field)
  // Notifications still see the whole comment.
  expect(
    jest.mocked(onCreateCommentOnContract).mock.calls[0][0].comment
  ).toMatchObject({
    id: 'c1',
    content,
    commentorPositionShares: 10,
  })
})

test('without a transaction, the comment is written and announced at once', async () => {
  const { continue: next } = await createCommentOnContractInternal(
    'market',
    auth,
    { content }
  )
  expect(getContract).toHaveBeenCalledWith(pg, 'market')
  expect(pg.none).toHaveBeenCalledWith(
    expect.stringContaining('insert into contract_comments'),
    expect.anything()
  )
  expect(broadcastNewComment).toHaveBeenCalledTimes(1)
  await next()
  expect(broadcastNewComment).toHaveBeenCalledTimes(1)
})

// The market's comment endpoint. Whether the market, the trade or the thread
// is also discussed on Yap never decides what it accepts or stores.
const comment = (props: Record<string, unknown>) =>
  createComment(
    API.comment.props.parse({ contractId: 'market', ...props }),
    auth,
    {} as never
  ) as Promise<{
    result: { id: string; content: unknown; isRepost?: boolean }
    continue: () => Promise<void>
  }>
const storedComment = () =>
  pg.none.mock.calls.find(([sql]) =>
    /insert into contract_comments/.test(sql)
  )![1][4]

test('a market comment is stored as written, whatever its length or formatting', async () => {
  const formatted = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Bold claim', marks: [{ type: 'bold' }] },
          {
            type: 'text',
            text: 'source',
            marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
          },
        ],
      },
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'one' }] },
            ],
          },
        ],
      },
      // Far past Yap's 2,000 characters, well inside the market's limit.
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'y'.repeat(2500) }],
      },
    ],
  }
  const { result } = await comment({ content: formatted })
  expect(result.content).toEqual(formatted)
  expect(storedComment().content).toEqual(formatted)
  // An ordinary comment, not a repost.
  expect(result.isRepost).toBeUndefined()
  expect(storedComment().socialPostId).toBeUndefined()
})

test('a market comment joins an open Yap discussion as a copy, before its own notifications', async () => {
  const parent = { id: 'market-market', root_id: 'market-market' } as SocialRow
  const row = { id: 'mc-c1', root_id: 'market-market' } as SocialRow
  jest
    .mocked(linkCommentToOpenDiscussion)
    .mockResolvedValueOnce({ parent, row })
  const { result, continue: next } = await comment({
    content,
    replyToBetId: undefined,
  })
  // Written and returned before anything about Yap is looked at.
  expect(linkCommentToOpenDiscussion).not.toHaveBeenCalled()
  await next()
  expect(linkCommentToOpenDiscussion).toHaveBeenCalledWith(
    pg,
    expect.objectContaining({ id: result.id, contractId: 'market' }),
    undefined
  )
  expect(notifySocial).toHaveBeenCalledWith(
    pg,
    parent,
    creator,
    'reply',
    'mc-c1'
  )
  expect(
    jest.mocked(linkCommentToOpenDiscussion).mock.invocationCallOrder[0]
  ).toBeLessThan(
    jest.mocked(onCreateCommentOnContract).mock.invocationCallOrder[0]
  )
})

test('a trade reply passes its trade on, and a market with no Yap discussion stays a plain comment', async () => {
  // The bet the comment replies to.
  pg.one = jest.fn().mockResolvedValue({
    bet_id: 'bet1',
    contract_id: 'market',
    user_id: 'trader',
    created_time: '2026-11-01T00:00:00.000Z',
    updated_time: '2026-11-01T00:00:00.000Z',
    data: { id: 'bet1', contractId: 'market', userId: 'trader', amount: 10 },
  })
  const { continue: next } = await comment({ content, replyToBetId: 'bet1' })
  await next()
  expect(linkCommentToOpenDiscussion).toHaveBeenCalledWith(
    pg,
    expect.anything(),
    'bet1'
  )
  expect(notifySocial).not.toHaveBeenCalled()
  expect(onCreateCommentOnContract).toHaveBeenCalledTimes(1)
})

test('a failure on the Yap side leaves an ordinary market comment', async () => {
  jest
    .mocked(linkCommentToOpenDiscussion)
    .mockRejectedValueOnce(new Error('thread unavailable'))
  const { result, continue: next } = await comment({ content })
  expect(result.id).toBeTruthy()
  await expect(next()).resolves.toBeUndefined()
  // Its own notifications still go out.
  expect(onCreateCommentOnContract).toHaveBeenCalledTimes(1)
})

test('only admins and moderators can post a mod comment', async () => {
  await expect(comment({ content, isModComment: true })).rejects.toMatchObject({
    code: 403,
  })
  expect(pg.none).not.toHaveBeenCalled()
})
