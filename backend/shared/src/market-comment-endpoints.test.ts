// The market's own comment endpoints once a comment is also on Yap: editing,
// hiding, deleting, pinning and reacting keep the market's rules, and what
// reaches Yap is decided by who acts. Real handlers against a fake client.
jest.mock('./utils', () => ({
  LOCAL_ONLY: true,
  log: Object.assign(jest.fn(), { warn: jest.fn(), error: jest.fn() }),
  getUser: jest.fn(),
  getContract: jest.fn(),
  revalidateStaticProps: jest.fn(async () => undefined),
  revalidateContractStaticProps: jest.fn(async () => undefined),
  sanitizeJsonContent: (content: unknown) => content,
}))
jest.mock('./supabase/init', () => ({ createSupabaseDirectClient: jest.fn() }))
jest.mock('./supabase/utils', () => ({ updateData: jest.fn() }))
jest.mock('./supabase/contract-comments', () => ({ getComment: jest.fn() }))
jest.mock('./supabase/posts', () => ({ getPost: jest.fn() }))
jest.mock('./analytics', () => ({ trackPublicEvent: jest.fn() }))
jest.mock('./new-account-gate', () => ({
  passesNewAccountGate: jest.fn(async () => true),
  newAccountGateMessage: jest.fn(),
}))
jest.mock('./websockets/helpers', () => ({ broadcastNewComment: jest.fn() }))
jest.mock('./tiptap', () => ({ anythingToRichText: jest.fn() }))
jest.mock('./txn/run-txn', () => ({ runTxnInBetQueue: jest.fn() }))
jest.mock('./notifications/create-new-like-notif', () => ({
  createLikeNotification: jest.fn(),
}))
jest.mock('./social-discussion', () => ({
  linkCommentToOpenDiscussion: jest.fn(async () => null),
  syncSocialPostFromComment: jest.fn(),
}))
jest.mock('./social-posts', () => ({
  lockSocialThread: jest.fn(),
  notifySocial: jest.fn(),
}))
jest.mock('api/helpers/rate-limit', () => ({
  onlyUsersWhoCanPerformAction: (_action: string, handler: unknown) => handler,
}))
jest.mock('api/on-create-comment-on-contract', () => ({
  onCreateCommentOnContract: jest.fn(),
}))
jest.mock('api/create-post-comment', () => ({ revalidatePost: jest.fn() }))
jest.mock('api/social-posts', () => ({
  withdrawLockedPost: jest.fn(),
  deleteSocialPost: jest.fn(async () => ({ success: true })),
  editSocialPost: jest.fn(),
  reactToSocialPost: jest.fn(),
}))

import { editComment } from 'api/edit-comment'
import { AuthedUser } from 'api/helpers/endpoint'
import { hideComment } from 'api/hide-comment'
import { pinComment } from 'api/pin-comment'
import { addOrRemoveReaction } from 'api/reaction'
import {
  withdrawLockedPost,
  deleteSocialPost,
  editSocialPost,
  reactToSocialPost,
} from 'api/social-posts'
import { API } from 'common/api/schema'
import { ContractComment } from 'common/comment'
import { Contract } from 'common/contract'
import { User } from 'common/user'
import { syncSocialPostFromComment } from './social-discussion'
import { lockSocialThread } from './social-posts'
import { getComment } from './supabase/contract-comments'
import { createSupabaseDirectClient } from './supabase/init'
import { updateData } from './supabase/utils'
import { getContract, getUser } from './utils'

const { MOD_IDS, isAdminId } = jest.requireActual('common/envs/constants')
// A moderator who is not also an admin: moderators hide and delete, only
// admins edit other people's comments.
const MOD = (MOD_IDS as string[]).find((id) => !isAdminId(id))!
const contract = {
  id: 'market',
  slug: 'market',
  creatorId: 'creator',
  creatorUsername: 'creator',
  token: 'MANA',
  visibility: 'public',
} as unknown as Contract
const comment = {
  id: 'c1',
  userId: 'commenter',
  contractId: 'market',
  content: { type: 'doc', content: [] },
} as unknown as ContractComment
const formatted = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Bold', marks: [{ type: 'bold' }] }],
    },
    { type: 'paragraph', content: [{ type: 'text', text: 'y'.repeat(2500) }] },
  ],
}
const as = (uid: string) =>
  ({ uid, creds: { kind: 'jwt' } } as unknown as AuthedUser)
const req = {} as never
const path = 'contracts/market/comments/c1'

// What the lookup of the comment's Yap row returns.
let linked: { id: string; removed?: boolean } | null
let inTx = false
let pg: {
  tx: jest.Mock
  none: jest.Mock
  one: jest.Mock
  oneOrNone: jest.Mock
  manyOrNone: jest.Mock
}
const sqlCalls = (pattern: RegExp) =>
  pg.none.mock.calls.filter(([sql]) => pattern.test(sql))

beforeEach(() => {
  jest.clearAllMocks()
  linked = null
  pg = {
    tx: jest.fn(async (fn) => {
      inTx = true
      try {
        return await fn(pg)
      } finally {
        inTx = false
      }
    }),
    none: jest.fn().mockResolvedValue(undefined),
    one: jest.fn().mockResolvedValue({ count: 1, reaction_id: 'r1' }),
    oneOrNone: jest.fn(async (sql: string) =>
      /from social_posts where market_comment_id/.test(sql)
        ? // edit-comment only takes a row that is still live on Yap.
          /deleted_time is null/.test(sql) && linked?.removed
          ? null
          : linked
        : /select user_id from contract_comments/.test(sql)
        ? { user_id: 'commenter' }
        : null
    ),
    manyOrNone: jest.fn().mockResolvedValue([]),
  }
  jest
    .mocked(createSupabaseDirectClient)
    .mockReturnValue(
      pg as unknown as ReturnType<typeof createSupabaseDirectClient>
    )
  jest
    .mocked(getUser)
    .mockImplementation(async (id: string) => ({ id, createdTime: 0 } as User))
  jest.mocked(getContract).mockResolvedValue(contract)
  jest.mocked(getComment).mockResolvedValue(comment)
})

const edit = (uid: string, content: object = formatted) =>
  editComment(
    API['edit-comment'].props.parse({
      contractId: 'market',
      commentId: 'c1',
      content,
    }),
    as(uid),
    req
  )

test('an edit on the market keeps the document as written and updates the Yap copy with it', async () => {
  linked = { id: 'mc-c1' }
  let editedInTx: boolean | undefined
  jest.mocked(updateData).mockImplementation(async () => {
    editedInTx = inTx
    return {} as Awaited<ReturnType<typeof updateData>>
  })
  await edit('commenter')
  // The market's own writer, with the formatting and the length the market allows.
  expect(jest.mocked(updateData).mock.calls[0][3]).toMatchObject({
    comment_id: 'c1',
    content: formatted,
  })
  expect(editedInTx).toBe(true)
  expect(lockSocialThread).toHaveBeenCalledWith(pg, 'mc-c1')
  expect(syncSocialPostFromComment).toHaveBeenCalledWith(pg, 'mc-c1', formatted)
  // Never through Yap's editor, with its limits and its edit window.
  expect(editSocialPost).not.toHaveBeenCalled()
})

test('an edit of a comment that is not on Yap, or was removed from it, is the plain market edit', async () => {
  await edit('commenter')
  linked = { id: 'mc-c1', removed: true }
  await edit('commenter')
  expect(updateData).toHaveBeenCalledTimes(2)
  expect(pg.tx).toHaveBeenCalledTimes(2)
  expect(syncSocialPostFromComment).not.toHaveBeenCalled()
})

test('only the author or an admin edits, and only on the comment’s own market', async () => {
  await expect(edit('someone-else')).rejects.toMatchObject({ code: 403 })
  await expect(edit(MOD)).rejects.toMatchObject({ code: 403 })
  jest
    .mocked(getComment)
    .mockResolvedValueOnce({ ...comment, contractId: 'other-market' })
  await expect(edit('commenter')).rejects.toMatchObject({ code: 400 })
  expect(updateData).not.toHaveBeenCalled()
})

const hide = (uid: string, action?: 'hide' | 'delete') =>
  hideComment(
    API['hide-comment'].props.parse({ commentPath: path, action }),
    as(uid),
    req
  )

test("a market creator's hide stays on the market", async () => {
  linked = { id: 'mc-c1' }
  await hide('creator')
  expect(jest.mocked(updateData).mock.calls[0][3]).toMatchObject({
    comment_id: 'c1',
    hidden: true,
    hiderId: 'creator',
  })
  expect(sqlCalls(/update social_posts set hidden_time/)).toHaveLength(0)
  expect(lockSocialThread).not.toHaveBeenCalled()
})

test("a moderator's hide and unhide reach the comment's Yap post", async () => {
  linked = { id: 'mc-c1' }
  await hide(MOD)
  expect(sqlCalls(/update social_posts set hidden_time/)[0][1]).toEqual([
    'mc-c1',
    true,
  ])
  jest.mocked(getComment).mockResolvedValueOnce({ ...comment, hidden: true })
  await hide(MOD)
  expect(sqlCalls(/update social_posts set hidden_time/)[1][1]).toEqual([
    'mc-c1',
    false,
  ])
  expect(lockSocialThread).toHaveBeenCalledTimes(2)
})

test('a moderator deleting a comment that is live on Yap removes both together', async () => {
  linked = { id: 'mc-c1' }
  await hide(MOD, 'delete')
  expect(withdrawLockedPost).toHaveBeenCalledTimes(1)
  expect(jest.mocked(updateData).mock.calls[0][3]).toMatchObject({
    deleted: true,
    comment_id: 'c1',
  })
})

test('a comment whose Yap post is already removed is still deleted on the market', async () => {
  linked = { id: 'mc-c1', removed: true }
  await hide(MOD, 'delete')
  expect(deleteSocialPost).not.toHaveBeenCalled()
  expect(jest.mocked(updateData).mock.calls[0][3]).toMatchObject({
    comment_id: 'c1',
    deleted: true,
    deleterId: MOD,
  })
})

test('the commenter and the market creator cannot delete, and a comment from another market is refused', async () => {
  await expect(hide('commenter', 'delete')).rejects.toMatchObject({ code: 403 })
  await expect(hide('creator', 'delete')).rejects.toMatchObject({ code: 403 })
  jest
    .mocked(getComment)
    .mockResolvedValue({ ...comment, contractId: 'other-market' })
  await expect(hide('creator')).rejects.toMatchObject({ code: 400 })
  await expect(hide(MOD, 'delete')).rejects.toMatchObject({ code: 400 })
  expect(updateData).not.toHaveBeenCalled()
  expect(deleteSocialPost).not.toHaveBeenCalled()
})

test('a comment can only be pinned on its own market', async () => {
  const pin = () =>
    pinComment(
      API['pin-comment'].props.parse({ commentPath: path }),
      as('creator'),
      req
    )
  jest
    .mocked(getComment)
    .mockResolvedValueOnce({ ...comment, contractId: 'other-market' })
  await expect(pin()).rejects.toMatchObject({ code: 400 })
  expect(updateData).not.toHaveBeenCalled()
  await pin()
  expect(jest.mocked(updateData).mock.calls[0][3]).toMatchObject({
    comment_id: 'c1',
    pinned: true,
    pinnerId: 'creator',
  })
})

test('a like made on the market is the market reaction, whether or not the comment is on Yap', async () => {
  linked = { id: 'mc-c1' }
  pg.manyOrNone.mockResolvedValue([])
  await addOrRemoveReaction(
    API.react.props.parse({ contentId: 'c1', contentType: 'comment' }),
    as('liker'),
    req
  )
  expect(reactToSocialPost).not.toHaveBeenCalled()
  const insert = pg.one.mock.calls.find(([sql]) =>
    /insert into user_reactions/.test(sql)
  )
  expect(insert![1]).toEqual(['c1', 'liker', 'like', 'commenter'])
  // Likes made on Yap still go to Yap's handler.
  await addOrRemoveReaction(
    API.react.props.parse({ contentId: 'post', contentType: 'social_post' }),
    as('liker'),
    req
  )
  expect(reactToSocialPost).toHaveBeenCalledTimes(1)
})
