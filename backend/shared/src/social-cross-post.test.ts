jest.mock('api/create-comment', () => ({
  validateComment: jest.fn(),
  createCommentOnContractInternal: jest.fn(),
  newCommentId: () => 'mirror',
}))
jest.mock('api/edit-comment', () => ({ editCommentContentInternal: jest.fn() }))
jest.mock('./utils', () => ({
  LOCAL_ONLY: true,
  log: { warn: jest.fn(), error: jest.fn() },
  getContract: jest.fn(),
  revalidateContractStaticProps: jest.fn(async () => undefined),
  sanitizeJsonContent: (content: unknown) => content,
}))
jest.mock('./supabase/init', () => ({ createSupabaseDirectClient: jest.fn() }))
jest.mock('./supabase/contract-comments', () => ({ getComment: jest.fn() }))
jest.mock('./supabase/utils', () => ({ updateData: jest.fn() }))
jest.mock('./analytics', () => ({ trackPublicEvent: jest.fn() }))
jest.mock('api/helpers/rate-limit', () => ({
  onlyUsersWhoCanPerformAction: (_action: string, handler: unknown) => handler,
  throwIfBannedFromAction: jest.fn(),
}))
jest.mock('./social-posts', () => ({
  socialAuthor: jest.fn(),
  getSocialViewer: jest.fn(),
  // The person's blocks read again under the write's locks: none are added,
  // unless a case sets the ones made since the request began.
  withCurrentBlocks: async (_pg: unknown, viewer: { blocked: string[] }) => ({
    ...viewer,
    blocked: [...viewer.blocked, ...mockBlocksMadeSince],
  }),
  assertSocialInteraction: jest.fn(),
  lockSocialThread: jest.fn(),
  limitSocialWrite: jest.fn(),
  validateSocialMarkets: jest.fn(),
  validateSocialRichContent: jest.fn(),
  validateSocialSource: jest.fn(),
  writeSocialMarkets: jest.fn(),
  hydrateSocialPosts: jest.fn(),
  notifySocial: jest.fn(),
}))
jest.mock('./social-discussion', () => ({
  // No id in these cases is a comment's own, so nothing is looked up first.
  isMarketCommentPostId: (id: string) => id.startsWith('mc-'),
  materializeSocialPost: jest.fn(),
  // The top-level comment of the thread that the comment answered is in.
  marketReplyTarget: jest.fn(async () => 'thread'),
  ensureMarketCommentPost: jest.fn(async () => ({ id: 'original' })),
  isCommentYapRepresentable: jest.fn(() => true),
  subscribeToSocialThread: jest.fn(),
}))
jest.mock('./new-account-gate', () => ({
  passesNewAccountGate: jest.fn(async () => true),
}))
jest.mock('./social-mentions', () => ({ notifySocialMentions: jest.fn() }))

import { Request } from 'express'
import { API } from 'common/api/schema'
import { ContractComment } from 'common/comment'
import { Contract } from 'common/contract'
import { SocialPost } from 'common/social-post'
import { User } from 'common/user'
import { AuthedUser } from 'api/helpers/endpoint'
import {
  createCommentOnContractInternal,
  validateComment,
} from 'api/create-comment'
import { editCommentContentInternal } from 'api/edit-comment'
import { throwIfBannedFromAction } from 'api/helpers/rate-limit'
import {
  createSocialPost,
  deleteSocialPost,
  editSocialPost,
} from 'api/social-posts'
import {
  isCommentYapRepresentable,
  marketReplyTarget,
  materializeSocialPost,
} from './social-discussion'
import { createSupabaseDirectClient } from './supabase/init'
import { getComment } from './supabase/contract-comments'
import { updateData } from './supabase/utils'
import { getContract } from './utils'
import { trackPublicEvent } from './analytics'
import {
  getSocialViewer,
  hydrateSocialPosts,
  lockSocialThread,
  SocialRow,
  socialAuthor,
  validateSocialRichContent,
} from './social-posts'
import { notifySocialMentions } from './social-mentions'

const row: SocialRow = {
  id: 'post',
  user_id: 'author',
  root_id: 'post',
  parent_id: null,
  text: 'Worth a look https://x.io',
  rich_content: null,
  image_urls: [],
  deleted_time: null,
  created_time: '2026-10-19T00:00:00Z',
  edited_time: null,
  source_post_id: null,
  source_contract_id: 'market',
  source_comment_id: 'reply',
  source_bet_id: null,
  deleted_by: null,
  removed_by_moderator: false,
  market_comment_id: null,
}
const actor = {
  id: 'author',
  name: 'Author',
  username: 'author',
  avatarUrl: 'a.png',
} as User
const auth = { uid: 'author' } as AuthedUser
const req = {} as Request
const mirror = {
  id: 'mirror',
  userId: 'author',
  contractId: 'market',
  betId: undefined,
} as ContractComment
const commentContinue = jest.fn()
// Records whether the comment was announced inside the transaction.
let announcedInTx: boolean | undefined
const commentAnnounce = jest.fn(() => {
  announcedInTx = inTx
})
let pg: {
  tx: jest.Mock
  one: jest.Mock
  oneOrNone: jest.Mock
  none: jest.Mock
  manyOrNone: jest.Mock
}
// The quoted comment, as recordSocialRepost reads it.
const quotedComment = (content: object = { type: 'doc', content: [] }) => ({
  user_id: 'quoted-author',
  content,
})
let inTx = false
// Whether each pg.none call, and the market comment, ran inside the transaction.
let noneInTx: boolean[] = []
let commentInTx: boolean | undefined
// Blocks made after a request read the person's blocks and before its locks.
let mockBlocksMadeSince: string[] = []
const sqlCalls = (pattern: RegExp) =>
  pg.none.mock.calls.filter(([sql]) => pattern.test(sql))

const create = (props: Record<string, unknown>) =>
  createSocialPost(
    API['create-social-post'].props.parse({
      content: { text: row.text, marketIds: ['market'] },
      source: { contractId: 'market', commentId: 'reply' },
      ...props,
    }),
    auth,
    req
  )

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse(row.created_time) + 1000)
  pg = {
    tx: jest.fn(async (fn) => {
      inTx = true
      try {
        return await fn(pg)
      } finally {
        inTx = false
      }
    }),
    // The insert returns the row.
    one: jest.fn(async () => row),
    oneOrNone: jest.fn().mockResolvedValue(quotedComment()),
    none: jest.fn(async () => {
      noneInTx.push(inTx)
      return null
    }),
    manyOrNone: jest.fn().mockResolvedValue([]),
  }
  noneInTx = []
  commentInTx = undefined
  announcedInTx = undefined
  mockBlocksMadeSince = []
  jest
    .mocked(createSupabaseDirectClient)
    .mockReturnValue(
      pg as unknown as ReturnType<typeof createSupabaseDirectClient>
    )
  jest.mocked(getSocialViewer).mockResolvedValue({ id: 'author', blocked: [] })
  jest.mocked(socialAuthor).mockResolvedValue(actor)
  jest.mocked(lockSocialThread).mockResolvedValue(row)
  jest.mocked(validateSocialRichContent).mockResolvedValue(null)
  jest
    .mocked(hydrateSocialPosts)
    .mockResolvedValue([{ id: 'post' } as SocialPost])
  jest.mocked(validateComment).mockImplementation(
    async (_market, _uid, content) =>
      ({
        contract: { id: 'market', creatorId: 'creator' },
        contentJson: content,
      } as Awaited<ReturnType<typeof validateComment>>)
  )
  jest.mocked(createCommentOnContractInternal).mockImplementation(async () => {
    commentInTx = inTx
    return {
      result: mirror,
      announce: commentAnnounce,
      continue: commentContinue,
    }
  })
  jest.mocked(getContract).mockResolvedValue({ id: 'market' } as Contract)
})
afterEach(() => jest.restoreAllMocks())

test('a Yap that also comments is refused for a block with the market creator, also one made after the request began', async () => {
  const refused = {
    code: 403,
    message: 'You cannot comment on this market because of a block',
  }
  // A block that is there when the request reads the author's blocks: it is
  // refused before anything is begun.
  jest
    .mocked(getSocialViewer)
    .mockResolvedValueOnce({ id: 'author', blocked: ['creator'] })
  await expect(create({ alsoComment: true })).rejects.toMatchObject(refused)
  expect(pg.tx).not.toHaveBeenCalled()

  // The creator blocks the author after that read. The list read again with
  // the write's locks held has the block, and nothing is written.
  mockBlocksMadeSince = ['creator']
  await expect(create({ alsoComment: true })).rejects.toMatchObject(refused)
  expect(pg.tx).toHaveBeenCalledTimes(1)
  expect(pg.one).not.toHaveBeenCalled()
  expect(createCommentOnContractInternal).not.toHaveBeenCalled()

  // A block with someone else changes nothing here.
  mockBlocksMadeSince = ['someone-else']
  await create({ alsoComment: true })
  expect(createCommentOnContractInternal).toHaveBeenCalledTimes(1)
})

test('a Yap shared from a comment also replies in that comment thread', async () => {
  const result = await create({ alsoComment: true })
  expect(jest.mocked(validateComment).mock.invocationCallOrder[0]).toBeLessThan(
    pg.tx.mock.invocationCallOrder[0]
  )
  // The Yap, its link, the comment and the repost rows share one transaction.
  expect(pg.one.mock.calls[0][1][11]).toBe('mirror')
  expect(commentInTx).toBe(true)
  // Announced once, right after the commit and before anything else runs.
  expect(commentAnnounce).toHaveBeenCalledTimes(1)
  expect(announcedInTx).toBe(false)
  expect(commentAnnounce.mock.invocationCallOrder[0]).toBeLessThan(
    jest.mocked(hydrateSocialPosts).mock.invocationCallOrder[0]
  )
  // The market comment replies to the top-level comment of the quoted
  // comment's thread, looked up on that comment's market in the transaction.
  expect(marketReplyTarget).toHaveBeenCalledWith(pg, 'market', 'reply')
  expect(createCommentOnContractInternal).toHaveBeenCalledWith(
    'market',
    auth,
    expect.objectContaining({
      id: 'mirror',
      replyToCommentId: 'thread',
      replyToBetId: undefined,
      isRepost: true,
      socialPostId: 'post',
    }),
    pg
  )
  const content = jest.mocked(createCommentOnContractInternal).mock.calls[0][2]
    .content
  expect(JSON.stringify(content)).toContain('"href":"https://x.io"')
  // The repost row names its Yap.
  const yapId = pg.one.mock.calls[0][1][0]
  const repostRow = sqlCalls(/insert into posts/)[0][1]
  expect(repostRow.slice(0, 4)).toEqual(['market', 'mirror', null, 'author'])
  expect(repostRow[7]).toBe(yapId)
  expect(
    noneInTx[
      pg.none.mock.calls.findIndex(([sql]) => /insert into posts/.test(sql))
    ]
  ).toBe(true)
  expect(sqlCalls(/'page repost'/)[0][1]).toEqual([
    'author',
    'market',
    'mirror',
    null,
  ])

  if (!('continue' in result)) throw new Error('Expected continuation')
  await result.continue()
  expect(commentContinue).toHaveBeenCalled()
  // The native comment notification path handles mentions and deduplicates thread subscribers.
  expect(notifySocialMentions).not.toHaveBeenCalled()
  expect(trackPublicEvent).toHaveBeenCalledWith(
    'author',
    'repost',
    expect.objectContaining({
      commentId: 'mirror',
      isContentOwner: true,
      socialPostId: yapId,
    })
  )
})

test('a failing comment continuation does not skip the repost audit', async () => {
  // An API caller's comment fee can fail after the repost has committed.
  commentContinue.mockRejectedValueOnce(new Error('insufficient balance'))
  const result = await create({ alsoComment: true })
  if (!('continue' in result)) throw new Error('Expected continuation')
  await expect(result.continue()).rejects.toThrow('insufficient balance')
  expect(trackPublicEvent).toHaveBeenCalledWith(
    'author',
    'repost',
    expect.objectContaining({ commentId: 'mirror' })
  )
})

test('without the market comment, a quote still records the legacy repost', async () => {
  const result = await create({})
  expect(validateComment).not.toHaveBeenCalled()
  expect(createCommentOnContractInternal).not.toHaveBeenCalled()
  expect(pg.one.mock.calls[0][1][11]).toBeNull()
  expect(sqlCalls(/insert into posts/)[0][1][1]).toBe('reply')
  if (!('continue' in result)) throw new Error('Expected continuation')
  await result.continue()
  expect(notifySocialMentions).toHaveBeenCalled()
  expect(trackPublicEvent).toHaveBeenCalledWith(
    'author',
    'repost',
    expect.objectContaining({ commentId: 'reply', isContentOwner: false })
  )
})

test('a quoted comment the repost card may not show is not reposted to feeds', async () => {
  pg.oneOrNone.mockResolvedValue(
    quotedComment({ type: 'doc', content: [{ type: 'gridCardsComponent' }] })
  )
  await create({})
  expect(sqlCalls(/insert into posts/)).toHaveLength(0)
  // The share still counts toward topic interests.
  expect(sqlCalls(/'page repost'/)).toHaveLength(1)
})

test('the comment is sized again once mentions carry their current labels', async () => {
  // Fits as drafted, but not as canonicalized inside the transaction.
  const canonical = {
    type: 'doc',
    content: Array.from({ length: 400 }, () => ({
      type: 'paragraph',
      content: [{ type: 'text', text: 'a' }],
    })),
  }
  jest.mocked(validateSocialRichContent).mockResolvedValue(canonical)
  await expect(create({ alsoComment: true })).rejects.toThrow(
    /too long to also comment/
  )
  expect(pg.tx).toHaveBeenCalled()
  expect(
    pg.one.mock.calls.some(([sql]) => /insert into social_posts/.test(sql))
  ).toBe(false)
  expect(createCommentOnContractInternal).not.toHaveBeenCalled()
})

test('an ineligible market comment fails before the Yap is written', async () => {
  jest.mocked(validateComment).mockRejectedValue(new Error('gated'))
  await expect(create({ alsoComment: true })).rejects.toThrow('gated')
  expect(pg.tx).not.toHaveBeenCalled()
})

test('a market creator block prevents the market comment', async () => {
  jest
    .mocked(getSocialViewer)
    .mockResolvedValue({ id: 'author', blocked: ['creator'] })
  await expect(create({ alsoComment: true })).rejects.toThrow(/block/)
  expect(pg.tx).not.toHaveBeenCalled()
})

test('a post too large for a comment is rejected up front when commenting', async () => {
  const text = Array.from({ length: 350 }, () => 'a').join('\n')
  await expect(
    create({
      alsoComment: true,
      content: { text, marketIds: ['market'] },
    })
  ).rejects.toThrow(/too long to also comment/)
  expect(pg.tx).not.toHaveBeenCalled()
})

test('a failed market comment fails the whole post, so nothing is half-published', async () => {
  jest
    .mocked(createCommentOnContractInternal)
    .mockRejectedValue(new Error('insert failed'))
  await expect(create({ alsoComment: true })).rejects.toThrow('insert failed')
  // The rejection aborts the transaction holding the Yap insert.
  expect(pg.tx).toHaveBeenCalledTimes(1)
  await expect(pg.tx.mock.results[0].value).rejects.toThrow('insert failed')
  expect(sqlCalls(/insert into posts/)).toHaveLength(0)
})

test('a trade share replies to the trade', async () => {
  await create({
    alsoComment: true,
    source: { contractId: 'market', betId: 'bet' },
  })
  expect(
    jest.mocked(createCommentOnContractInternal).mock.calls[0][2]
  ).toMatchObject({ replyToCommentId: undefined, replyToBetId: 'bet' })
})

test.each([
  ['a reply', { parentId: 'post' }],
  ['a quoted Yap post', { source: { postId: 'other' } }],
  [
    'a post with nothing to say',
    { content: { text: '', marketIds: ['market'] } },
  ],
])(
  'asking to comment from %s is rejected rather than ignored',
  async (_case, props) => {
    jest.mocked(lockSocialThread).mockResolvedValue(row)
    await expect(create({ alsoComment: true, ...props })).rejects.toThrow(
      /can also comment on it/
    )
    expect(pg.tx).not.toHaveBeenCalled()
    expect(createCommentOnContractInternal).not.toHaveBeenCalled()
  }
)

const edit = (text: string) =>
  editSocialPost(
    API['edit-social-post'].props.parse({
      id: 'post',
      content: { text, marketIds: ['market'] },
    }),
    auth,
    req
  )

test('edits update the market comment inside the locked transaction', async () => {
  pg.one.mockResolvedValue({ ...row, market_comment_id: 'mirror' })
  jest.mocked(getComment).mockResolvedValue(mirror)
  let synced: boolean | undefined
  jest
    .mocked(editCommentContentInternal)
    .mockImplementation(async () => void (synced = inTx))
  await edit(row.text)
  expect(synced).toBe(true)
  expect(editCommentContentInternal).toHaveBeenCalledWith(
    pg,
    expect.objectContaining({ id: 'market' }),
    mirror,
    'author',
    expect.objectContaining({ type: 'doc' })
  )
})

test('an edit too large for its market comment is rejected', async () => {
  const text = Array.from({ length: 350 }, () => 'a').join('\n')
  pg.one.mockResolvedValue({ ...row, text, market_comment_id: 'mirror' })
  jest.mocked(getComment).mockResolvedValue(mirror)
  await expect(edit(text)).rejects.toThrow(/too long to also comment/)
  expect(editCommentContentInternal).not.toHaveBeenCalled()
})

test('a Yap edit of a comment with formatting Yap cannot hold is refused', async () => {
  pg.one.mockResolvedValue({ ...row, market_comment_id: 'mirror' })
  jest.mocked(getComment).mockResolvedValue(mirror)
  jest.mocked(isCommentYapRepresentable).mockReturnValueOnce(false)
  await expect(edit(row.text)).rejects.toMatchObject({
    code: 400,
    message: expect.stringMatching(/Edit it on its market/),
  })
  // The market comment keeps the document it has.
  expect(editCommentContentInternal).not.toHaveBeenCalled()
})

// Authors cannot delete market comments, so removing their own Yap takes it
// off Yap only. A moderator's removal takes the comment with it.
test.each([
  ['author', 'author', false],
  ['moderator', 'mod', true],
])(
  '%s removal of a Yap (uid %s) deletes its market comment: %s',
  async (_who, uid, deletes) => {
    jest
      .mocked(lockSocialThread)
      .mockResolvedValue({ ...row, market_comment_id: 'mirror' })
    jest.mocked(getComment).mockResolvedValue(mirror)
    let deletedInTx: boolean | undefined
    jest.mocked(updateData).mockImplementation(async () => {
      deletedInTx = inTx
      return {} as Awaited<ReturnType<typeof updateData>>
    })
    const { MOD_IDS } = jest.requireActual('common/envs/constants')
    const actorId = uid === 'mod' ? MOD_IDS[0] : uid
    await deleteSocialPost({ id: 'post' }, { uid: actorId } as AuthedUser, req)
    expect(jest.mocked(updateData).mock.calls.length > 0).toBe(deletes)
    // Either way the Yap's repost leaves followers' feeds.
    expect(sqlCalls(/delete from posts where social_post_id/)[0][1]).toEqual([
      'post',
    ])
    const unlinked = sqlCalls(/data - 'socialPostId'/)
    if (deletes) {
      // Same transaction as the Yap removal, so the two cannot diverge.
      expect(deletedInTx).toBe(true)
      expect(jest.mocked(updateData).mock.calls[0][3]).toMatchObject({
        comment_id: 'mirror',
        deleted: true,
      })
      // Under the market's own rule for deleting comments.
      expect(throwIfBannedFromAction).toHaveBeenCalledWith(
        pg,
        actorId,
        'hideComment'
      )
      expect(unlinked).toHaveLength(0)
      expect(trackPublicEvent).toHaveBeenCalledWith(
        actorId,
        'delete_comment',
        expect.objectContaining({ commentId: 'mirror', socialPostId: 'post' })
      )
    } else {
      // The comment stays on its market and stops pointing at the removed Yap.
      expect(unlinked).toHaveLength(1)
      expect(unlinked[0][1]).toEqual(['mirror', 'post'])
      expect(throwIfBannedFromAction).not.toHaveBeenCalled()
      expect(trackPublicEvent).not.toHaveBeenCalled()
    }
  }
)

test('a moderator banned from moderating comments cannot remove a shared comment through Yap', async () => {
  const { MOD_IDS } = jest.requireActual('common/envs/constants')
  jest
    .mocked(lockSocialThread)
    .mockResolvedValue({ ...row, market_comment_id: 'mirror' })
  jest.mocked(getComment).mockResolvedValue(mirror)
  jest.mocked(throwIfBannedFromAction).mockRejectedValueOnce(
    Object.assign(new Error('You are banned from hiding comments'), {
      code: 403,
    })
  )
  await expect(
    deleteSocialPost({ id: 'post' }, { uid: MOD_IDS[0] } as AuthedUser, req)
  ).rejects.toMatchObject({ code: 403 })
  // Refused before either record is touched.
  expect(sqlCalls(/update social_posts set text=''/)).toHaveLength(0)
  expect(updateData).not.toHaveBeenCalled()
})

test('an admin or moderator removing their own shared post leaves their market comment', async () => {
  // hide-comment refuses to delete a comment by an admin or moderator, their
  // own included; removing the Yap is not a way around that.
  const { MOD_IDS } = jest.requireActual('common/envs/constants')
  jest.mocked(lockSocialThread).mockResolvedValue({
    ...row,
    user_id: MOD_IDS[0],
    market_comment_id: 'mirror',
  })
  jest.mocked(getComment).mockResolvedValue({ ...mirror, userId: MOD_IDS[0] })
  await deleteSocialPost({ id: 'post' }, { uid: MOD_IDS[0] } as AuthedUser, req)
  expect(sqlCalls(/update social_posts set text=''/)).toHaveLength(1)
  expect(updateData).not.toHaveBeenCalled()
  expect(trackPublicEvent).not.toHaveBeenCalled()
})

test('a moderator removal leaves market comments by admins and moderators', async () => {
  const { MOD_IDS } = jest.requireActual('common/envs/constants')
  jest.mocked(lockSocialThread).mockResolvedValue({
    ...row,
    user_id: MOD_IDS[1],
    market_comment_id: 'mirror',
  })
  jest.mocked(getComment).mockResolvedValue({ ...mirror, userId: MOD_IDS[1] })
  await expect(
    deleteSocialPost({ id: 'post' }, { uid: MOD_IDS[0] } as AuthedUser, req)
  ).rejects.toMatchObject({ code: 403 })
  expect(updateData).not.toHaveBeenCalled()
  expect(trackPublicEvent).not.toHaveBeenCalled()
})

// A market comment can be on Yap without a post of its own, under the id its
// post will have (mc-<commentId>). The first action on it gives it that post.
test("acting on a comment's own post id gives the comment its post first; any other id is not looked up", async () => {
  const made = jest.mocked(materializeSocialPost)
  const madeInTx: boolean[] = []
  made.mockImplementation(async () => {
    madeInTx.push(inTx)
    return row
  })
  const words = (text: string) => ({ text, marketIds: [] })

  // A reply: in the reply's own transaction, before the thread is locked, so
  // a reply that is refused leaves no post behind.
  await create({
    parentId: 'mc-c1',
    source: undefined,
    content: words('a reply'),
  })
  expect(made.mock.calls).toEqual([[pg, 'mc-c1']])
  expect(madeInTx).toEqual([true])
  expect(made.mock.invocationCallOrder[0]).toBeLessThan(
    jest.mocked(lockSocialThread).mock.invocationCallOrder[0]
  )

  // A quote: in the quote's own transaction too, with the person quoting, so
  // a quote that is refused leaves no post behind either.
  const quoting = { id: 'author', blocked: [] }
  made.mockClear()
  pg.tx.mockClear()
  await create({ source: { postId: 'mc-c2' }, content: words('a quote') })
  expect(made.mock.calls).toEqual([[pg, 'mc-c2', quoting]])
  expect(pg.tx).toHaveBeenCalledTimes(1)
  expect(made.mock.invocationCallOrder[0]).toBeGreaterThan(
    pg.tx.mock.invocationCallOrder[0]
  )

  // A reply that also quotes: the quoted comment in a transaction of its own,
  // before the reply's. Each then asks for one comment's lock and one
  // thread's, in that order, and neither waits on the other.
  made.mockClear()
  pg.tx.mockClear()
  jest.mocked(lockSocialThread).mockClear()
  await create({
    parentId: 'mc-c5',
    source: { postId: 'mc-c6' },
    content: words('a reply with a quote'),
  })
  expect(made.mock.calls).toEqual([
    [pg, 'mc-c6', quoting],
    [pg, 'mc-c5'],
  ])
  expect(pg.tx).toHaveBeenCalledTimes(2)
  expect(made.mock.invocationCallOrder[0]).toBeLessThan(
    pg.tx.mock.invocationCallOrder[1]
  )
  expect(made.mock.invocationCallOrder[1]).toBeGreaterThan(
    pg.tx.mock.invocationCallOrder[1]
  )
  expect(made.mock.invocationCallOrder[1]).toBeLessThan(
    jest.mocked(lockSocialThread).mock.invocationCallOrder[0]
  )

  // A reply that quotes the very comment it replies to has one comment to
  // lock: one transaction, and a refusal leaves nothing.
  made.mockClear()
  pg.tx.mockClear()
  await create({
    parentId: 'mc-c7',
    source: { postId: 'mc-c7' },
    content: words('a reply that quotes what it replies to'),
  })
  expect(made.mock.calls).toEqual([[pg, 'mc-c7']])
  expect(pg.tx).toHaveBeenCalledTimes(1)

  // An edit and a removal: before the post is locked.
  made.mockClear()
  await editSocialPost(
    API['edit-social-post'].props.parse({
      id: 'mc-c3',
      content: words('edited'),
    }),
    auth,
    req
  )
  await deleteSocialPost({ id: 'mc-c4' }, auth, req)
  expect(made.mock.calls).toEqual([
    [pg, 'mc-c3'],
    [pg, 'mc-c4'],
  ])

  // Any other id names a post or nothing, and costs no lookup.
  made.mockClear()
  await create({
    parentId: 'post',
    source: undefined,
    content: words('a reply'),
  })
  await create({ source: { postId: 'post' }, content: words('a quote') })
  await deleteSocialPost({ id: 'post' }, auth, req)
  expect(made).not.toHaveBeenCalled()
})
