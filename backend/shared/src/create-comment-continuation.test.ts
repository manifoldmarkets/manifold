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

import { createCommentOnContractInternal } from 'api/create-comment'
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
let pg: { none: jest.Mock; oneOrNone: jest.Mock; map: jest.Mock }
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
