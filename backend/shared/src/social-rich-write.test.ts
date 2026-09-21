jest.mock('./utils', () => ({ LOCAL_ONLY: true, log: { warn: jest.fn() } }))
jest.mock('./supabase/init', () => ({ createSupabaseDirectClient: jest.fn() }))
jest.mock('api/helpers/rate-limit', () => ({
  onlyUsersWhoCanPerformAction: (_action: string, handler: unknown) => handler,
}))
jest.mock('./social-posts', () => ({
  socialAuthor: jest.fn(),
  getSocialViewer: jest.fn(),
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
import { SocialPost } from 'common/social-post'
import { User } from 'common/user'
import { AuthedUser } from 'api/helpers/endpoint'
import {
  createSocialPost,
  deleteSocialPost,
  editSocialPost,
} from 'api/social-posts'
import { createSupabaseDirectClient } from './supabase/init'
import {
  getSocialViewer,
  hydrateSocialPosts,
  lockSocialThread,
  SocialRow,
  socialAuthor,
  validateSocialRichContent,
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
let pg: { tx: jest.Mock; one: jest.Mock; none: jest.Mock }

beforeEach(() => {
  jest.clearAllMocks()
  pg = {
    tx: jest.fn(async (fn) => fn(pg)),
    one: jest.fn().mockResolvedValue(row),
    none: jest.fn().mockResolvedValue(null),
  }
  jest
    .mocked(createSupabaseDirectClient)
    .mockReturnValue(
      pg as unknown as ReturnType<typeof createSupabaseDirectClient>
    )
  jest.mocked(getSocialViewer).mockResolvedValue({ id: 'author', blocked: [] })
  jest.mocked(socialAuthor).mockResolvedValue(actor)
  jest.mocked(lockSocialThread).mockResolvedValue(row)
  jest
    .mocked(hydrateSocialPosts)
    .mockResolvedValue([{ id: 'post' } as SocialPost])
  jest.mocked(validateSocialRichContent).mockResolvedValue(null)
})

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
