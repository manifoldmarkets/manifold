jest.mock('./utils', () => ({ LOCAL_ONLY: true, log: { warn: jest.fn() } }))
jest.mock('./supabase/init', () => ({ createSupabaseDirectClient: jest.fn() }))
jest.mock('api/helpers/rate-limit', () => ({
  onlyUsersWhoCanPerformAction: (_action: string, handler: unknown) => handler,
}))
jest.mock('./social-posts', () => ({
  socialAuthor: jest.fn(),
  getSocialViewer: jest.fn(),
  getSocialRow: jest.fn(),
  getSocialEditContent: jest.fn(),
  lockSocialThread: jest.fn(),
  limitSocialWrite: jest.fn(),
  validateSocialMarkets: jest.fn(),
  validateSocialRichContent: jest.fn(),
  validateSocialSource: jest.fn(),
  writeSocialMarkets: jest.fn(),
  hydrateSocialPosts: jest.fn(),
}))
jest.mock('./social-mentions', () => ({ notifySocialMentions: jest.fn() }))

import { Request } from 'express'
import { API } from 'common/api/schema'
import { textToSocialRichContent } from 'common/social-rich-content'
import { SocialPost, SOCIAL_POST_EDIT_WINDOW_MS } from 'common/social-post'
import { User } from 'common/user'
import { AuthedUser } from 'api/helpers/endpoint'
import {
  createSocialPost,
  deleteSocialPost,
  editSocialPost,
  getSocialPost,
} from 'api/social-posts'
import { createSupabaseDirectClient } from './supabase/init'
import {
  getSocialViewer,
  getSocialRow,
  getSocialEditContent,
  hydrateSocialPosts,
  lockSocialThread,
  SocialRow,
  socialAuthor,
  validateSocialRichContent,
  writeSocialMarkets,
  limitSocialWrite,
} from './social-posts'
import { notifySocialMentions } from './social-mentions'

const rich = textToSocialRichContent('Existing text')
const row: SocialRow = {
  id: 'post',
  user_id: 'author',
  root_id: 'post',
  parent_id: null,
  text: 'Existing text',
  rich_content: rich,
  image_urls: [],
  deleted_time: null,
  created_time: '2026-09-21T00:00:00Z',
  edited_time: null,
  source_post_id: null,
  source_contract_id: null,
  source_comment_id: null,
  source_bet_id: null,
  deleted_by: null,
  removed_by_moderator: false,
}
const actor = { id: 'author' } as User
const auth = { uid: 'author' } as AuthedUser
const req = {} as Request
const createdTime = Date.parse(row.created_time)
const editDeadline = createdTime + SOCIAL_POST_EDIT_WINDOW_MS
let pg: {
  tx: jest.Mock
  one: jest.Mock
  none: jest.Mock
  manyOrNone: jest.Mock
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(Date, 'now').mockReturnValue(createdTime + 60_000)
  pg = {
    tx: jest.fn(async (fn) => fn(pg)),
    one: jest.fn().mockResolvedValue(row),
    none: jest.fn().mockResolvedValue(null),
    manyOrNone: jest.fn().mockResolvedValue([]),
  }
  jest
    .mocked(createSupabaseDirectClient)
    .mockReturnValue(
      pg as unknown as ReturnType<typeof createSupabaseDirectClient>
    )
  jest.mocked(getSocialViewer).mockResolvedValue({ id: 'author', blocked: [] })
  jest.mocked(socialAuthor).mockResolvedValue(actor)
  jest.mocked(lockSocialThread).mockResolvedValue(row)
  jest.mocked(getSocialRow).mockResolvedValue(row)
  jest.mocked(getSocialEditContent).mockReturnValue(rich)
  jest
    .mocked(hydrateSocialPosts)
    .mockResolvedValue([{ id: 'post' } as SocialPost])
  jest.mocked(validateSocialRichContent).mockResolvedValue(null)
})
afterEach(() => jest.restoreAllMocks())

test('creation persists canonical rich content and derives its plain fallback', async () => {
  const canonical = textToSocialRichContent('Canonical server text')
  jest.mocked(validateSocialRichContent).mockResolvedValue(canonical)
  const result = await createSocialPost(
    API['create-social-post'].props.parse({
      content: { text: 'untrusted fallback', richContent: rich },
    }),
    auth,
    req
  )
  const values = pg.one.mock.calls[0][1]
  expect(values[2]).toBe('Canonical server text')
  expect(values[10]).toEqual(canonical)
  if (!('continue' in result))
    throw new Error('Expected notification continuation')
  await result.continue()
  expect(notifySocialMentions).toHaveBeenCalledWith(pg, row, actor, undefined)
})

test.each([
  ['unchanged legacy edit', { text: 'Existing text' }, rich],
  ['changed legacy edit', { text: 'Plain replacement' }, null],
  [
    'explicit plain replacement',
    { text: 'Existing text', richContent: null },
    null,
  ],
])(
  '%s preserves or clears rich content consistently',
  async (_label, content, expected) => {
    await editSocialPost(
      API['edit-social-post'].props.parse({ id: 'post', content }),
      auth,
      req
    )
    expect(pg.one.mock.calls[0][1][4]).toEqual(expected)
    expect(notifySocialMentions).not.toHaveBeenCalled()
  }
)

test('deletion clears rich content and mentions across every recipient', async () => {
  jest.mocked(Date.now).mockReturnValue(editDeadline + 60_000)
  await deleteSocialPost({ id: 'post' }, auth, req)
  expect(pg.none).toHaveBeenCalledWith(
    expect.stringContaining('rich_content=null'),
    ['post', 'author', false]
  )
  expect(pg.none).toHaveBeenCalledWith(
    'delete from user_notifications where notification_id=$1',
    ['social-mention-post']
  )
})

describe.each(['root', 'reply'] as const)('%s edit window', (kind) => {
  test.each([-1, 0, 1])(
    'accepts only requests before the deadline (%i ms from cutoff)',
    async (offset) => {
      jest.mocked(Date.now).mockReturnValue(editDeadline + offset)
      jest.mocked(lockSocialThread).mockResolvedValue({
        ...row,
        parent_id: kind === 'reply' ? 'parent' : null,
        root_id: kind === 'reply' ? 'parent' : row.id,
        // A recent edit does not restart the original posting window.
        edited_time: new Date(editDeadline - 1000).toISOString(),
      })
      const request = editSocialPost(
        API['edit-social-post'].props.parse({
          id: row.id,
          content: { text: 'Changed text', marketIds: [], imageUrls: [] },
        }),
        auth,
        req
      )
      if (offset < 0) {
        await expect(request).resolves.toMatchObject({ id: row.id })
        expect(pg.one).toHaveBeenCalled()
        expect(writeSocialMarkets).toHaveBeenCalled()
      } else {
        await expect(request).rejects.toMatchObject({
          code: 403,
          message: 'Yap posts can only be edited within 30 minutes of posting.',
        })
        expect(pg.one).not.toHaveBeenCalled()
        expect(pg.none).not.toHaveBeenCalled()
        expect(writeSocialMarkets).not.toHaveBeenCalled()
        expect(limitSocialWrite).not.toHaveBeenCalled()
      }
    }
  )
})

test('an edit opened before expiry is rejected if its locked request reaches the cutoff', async () => {
  jest.mocked(Date.now).mockReturnValue(editDeadline - 1)
  const detail = await getSocialPost({ id: row.id }, auth, req)
  expect(detail).toHaveProperty('editContent')
  const submitted = API['edit-social-post'].props.parse({
    id: row.id,
    content: { text: row.text, marketIds: ['new-attachment'] },
  })
  jest.mocked(lockSocialThread).mockImplementation(async () => {
    jest.mocked(Date.now).mockReturnValue(editDeadline)
    return row
  })
  await expect(editSocialPost(submitted, auth, req)).rejects.toMatchObject({
    code: 403,
  })
  expect(pg.one).not.toHaveBeenCalled()
  expect(pg.none).not.toHaveBeenCalled()
  expect(writeSocialMarkets).not.toHaveBeenCalled()
})

test.each([-1, 0, 1])(
  'detail returns editContent only before the edit deadline (%i ms from cutoff)',
  async (offset) => {
    jest.mocked(Date.now).mockReturnValue(editDeadline + offset)
    const detail = await getSocialPost({ id: row.id }, auth, req)
    if (offset < 0) {
      expect(detail).toHaveProperty('editContent', rich)
      expect(getSocialEditContent).toHaveBeenCalled()
    } else {
      expect(detail).not.toHaveProperty('editContent')
      expect(getSocialEditContent).not.toHaveBeenCalled()
    }
  }
)

test('rich edits validate retained references against the locked stored document', async () => {
  await editSocialPost(
    API['edit-social-post'].props.parse({
      id: 'post',
      content: { text: 'Existing text', richContent: rich },
    }),
    auth,
    req
  )
  expect(validateSocialRichContent).toHaveBeenCalledWith(
    pg,
    rich,
    { id: 'author', blocked: [] },
    row.rich_content
  )
})

test.each([
  ['author', null, true],
  ['another-reader', null, false],
  ['author', '2026-09-22T00:00:00Z', false],
] as const)(
  'detail includes a separate editing document only for the live author: %s, %s',
  async (uid, deleted_time, includesEdit) => {
    jest.mocked(getSocialRow).mockResolvedValue({ ...row, deleted_time })
    const displayed = textToSocialRichContent('Public redacted text')
    const publicPost = { id: 'post', richContent: displayed } as SocialPost
    jest.mocked(hydrateSocialPosts).mockResolvedValue([publicPost])
    const result = await getSocialPost(
      { id: 'post' },
      { uid } as AuthedUser,
      req
    )
    expect(result).toEqual({
      post: publicPost,
      ancestors: [],
      ...(includesEdit ? { editContent: rich } : {}),
    })
    if (includesEdit)
      expect(getSocialEditContent).toHaveBeenCalledWith(
        row.rich_content,
        displayed
      )
    else expect(getSocialEditContent).not.toHaveBeenCalled()
    expect(publicPost).not.toHaveProperty('editContent')
  }
)
