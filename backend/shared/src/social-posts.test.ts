jest.mock('./utils', () => ({ getUser: jest.fn(), getPrivateUser: jest.fn() }))
jest.mock('./supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(() => ({})),
}))
jest.mock('./supabase/entitlements', () => ({
  getActiveSupporterEntitlements: jest.fn(),
}))
jest.mock('./supabase/notifications', () => ({
  insertNotificationToSupabase: jest.fn(),
}))
import { getPrivateUser, getUser } from './utils'
import { getActiveSupporterEntitlements } from './supabase/entitlements'
import { insertNotificationToSupabase } from './supabase/notifications'
import {
  assertSocialInteraction,
  getSocialViewer,
  limitSocialWrite,
  socialAuthor,
  SocialRow,
  validateSocialMarkets,
  validateSocialRichContent,
  validateSocialSource,
  notifySocial,
  hydrateSocialPosts,
  getSocialEditContent,
} from './social-posts'
import { SupabaseDirectClient } from './supabase/init'
import { User } from 'common/user'
import { SUPPORTER_TIERS } from 'common/supporter-config'
import { FIREBASE_CONFIG } from 'common/envs/constants'
import {
  SocialRichContent,
  socialRichContentToText,
  textToSocialRichContent,
} from 'common/social-rich-content'
import { convertEntitlement } from 'common/shop/types'

const post = {
  id: 'reply',
  user_id: 'parent-author',
  root_id: 'root',
  text: 'hello',
  deleted_time: null,
} as SocialRow
const db = (methods: Record<string, unknown>) =>
  methods as unknown as SupabaseDirectClient
beforeEach(() => jest.clearAllMocks())

test('hydrates cosmetic entitlements for authors, parents, and quoted authors in existing queries', async () => {
  const entitlement = (user_id: string) => ({
    user_id,
    entitlement_id: 'avatar-crown',
    granted_time: '2026-09-01T00:00:00Z',
    expires_time: null,
    enabled: true,
    auto_renew: false,
    metadata: { position: 1 },
  })
  const user = (id: string) => ({
    id,
    name: id,
    username: id,
    data: { avatarUrl: `${id}.png` },
    entitlements: [entitlement(id)],
  })
  const base = {
    ...post,
    created_time: '2026-09-21T00:00:00Z',
    rich_content: null,
  }
  const quoted = {
    ...base,
    id: 'quoted',
    user_id: 'quoted-author',
    root_id: 'quoted',
    parent_id: null,
  } as SocialRow
  const parent = {
    ...base,
    id: 'parent',
    user_id: 'parent-author',
    root_id: 'parent',
    parent_id: null,
  } as SocialRow
  const reply = {
    ...base,
    id: 'reply',
    user_id: 'reply-author',
    root_id: 'parent',
    parent_id: 'parent',
    source_post_id: 'quoted',
  } as SocialRow
  const marketComment = {
    ...base,
    id: 'comment-share',
    user_id: 'reply-author',
    root_id: 'comment-share',
    parent_id: null,
    source_contract_id: 'market',
    source_comment_id: 'comment',
  } as SocialRow
  const marketBet = {
    ...base,
    id: 'bet-share',
    user_id: 'reply-author',
    root_id: 'bet-share',
    parent_id: null,
    source_contract_id: 'market',
    source_bet_id: 'bet',
  } as SocialRow
  const sourceAuthor = (id: string) => ({
    id,
    name: id,
    username: id,
    avatarUrl: `${id}.png`,
    entitlements: [entitlement(id)],
  })
  const manyOrNone = jest.fn(async (sql: string) => {
    if (sql.includes('select id, name, username, data'))
      return ['quoted-author', 'parent-author', 'reply-author'].map(user)
    if (sql.includes('select * from social_posts'))
      return [quoted, parent, reply, marketComment, marketBet]
    if (sql.includes('where p.id=any')) return [quoted]
    if (sql.includes('from contract_comments cc'))
      return [
        {
          comment_id: 'comment',
          user_id: 'comment-author',
          author: sourceAuthor('comment-author'),
          data: {
            content: {
              type: 'doc',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Comment' }],
                },
              ],
            },
          },
        },
      ]
    if (sql.includes('from contract_bets b'))
      return [
        {
          bet_id: 'bet',
          user_id: 'bet-author',
          name: 'Bettor',
          author: sourceAuthor('bet-author'),
          data: { amount: 10, outcome: 'YES' },
        },
      ]
    if (sql.includes('select * from contracts')) return [mentionedMarket]
    return []
  })
  const [hydrated, commentShare, betShare] = await hydrateSocialPosts(
    db({ manyOrNone }),
    [reply, marketComment, marketBet],
    { blocked: [] },
    false
  )
  expect(hydrated.author.entitlements).toEqual([
    convertEntitlement(entitlement('reply-author')),
  ])
  expect(hydrated.parentAuthor?.entitlements).toEqual([
    convertEntitlement(entitlement('parent-author')),
  ])
  expect(hydrated.source?.author?.entitlements).toEqual([
    convertEntitlement(entitlement('quoted-author')),
  ])
  expect(commentShare.source?.author?.entitlements).toEqual([
    convertEntitlement(entitlement('comment-author')),
  ])
  expect(betShare.source?.author?.entitlements).toEqual([
    convertEntitlement(entitlement('bet-author')),
  ])
  expect(manyOrNone).toHaveBeenCalledTimes(17)
  expect(manyOrNone).toHaveBeenCalledWith(
    expect.stringContaining(
      'from user_entitlements e where e.user_id=users.id'
    ),
    expect.anything()
  )
})

const mentionedContent: SocialRichContent = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'mention', attrs: { id: 'mentioned', label: 'forged-name' } },
        { type: 'text', text: ' see ' },
        {
          type: 'contract-mention',
          attrs: { id: 'market', label: 'javascript:forged' },
        },
      ],
    },
  ],
}
const mentionedMarket = {
  id: 'market',
  data: { id: 'market', creatorUsername: 'owner', slug: 'real-market' },
}

test('rich mention writes canonicalize labels and reject unavailable or blocked identities', async () => {
  const pg = db({
    manyOrNone: jest.fn((sql: string) =>
      Promise.resolve(
        sql.includes('from users')
          ? [{ id: 'mentioned', username: 'real-user' }]
          : [mentionedMarket]
      )
    ),
  })
  const canonical = await validateSocialRichContent(pg, mentionedContent, {
    blocked: [],
  })
  expect(canonical?.content?.[0].content?.[0].attrs).toEqual({
    id: 'mentioned',
    label: 'real-user',
  })
  expect(canonical?.content?.[0].content?.[2].attrs).toEqual({
    id: 'market',
    label: '/owner/real-market',
  })
  await expect(
    validateSocialRichContent(pg, mentionedContent, { blocked: ['mentioned'] })
  ).rejects.toMatchObject({ code: 400 })
  for (const missing of ['users', 'contracts']) {
    const unavailable = db({
      manyOrNone: jest.fn((sql: string) =>
        Promise.resolve(
          sql.includes(`from ${missing}`)
            ? []
            : sql.includes('from users')
            ? [{ id: 'mentioned', username: 'real-user' }]
            : [mentionedMarket]
        )
      ),
    })
    await expect(
      validateSocialRichContent(unavailable, mentionedContent, { blocked: [] })
    ).rejects.toMatchObject({ code: 400 })
  }
})

test('rich reads redact unavailable market references from both rich and fallback text', async () => {
  const row = {
    ...post,
    id: 'root',
    root_id: 'root',
    parent_id: null,
    created_time: '2026-09-21 00:00:00+00',
    rich_content: mentionedContent,
    text: '@forged-name see %private-market',
  } as SocialRow
  const pg = db({
    manyOrNone: jest.fn(async (sql: string) => {
      if (sql.includes('select id, name, username, data'))
        return [
          { id: row.user_id, name: 'Author', username: 'author', data: {} },
          {
            id: 'mentioned',
            name: 'Mentioned',
            username: 'current-user',
            data: {},
          },
        ]
      if (sql.includes('select * from social_posts')) return [row]
      return []
    }),
  })
  const [result] = await hydrateSocialPosts(pg, [row], { blocked: [] }, false)
  expect(result.text).toBe('@current-user see [Market unavailable]')
  expect(JSON.stringify(result.richContent)).not.toMatch(
    /market"|private-market|javascript:forged/
  )
  const [removed] = await hydrateSocialPosts(
    pg,
    [{ ...row, deleted_time: 'now' }],
    { blocked: [] },
    false
  )
  expect(removed.richContent).toBeNull()
  expect(removed.text).toBe('')
})

test('editing keeps unavailable reference identities without returning their stored labels', () => {
  const stored = {
    ...mentionedContent,
    content: [
      {
        type: 'paragraph',
        content: [
          ...mentionedContent.content![0].content!,
          { type: 'text', text: '[Market unavailable]' },
        ],
      },
    ],
  }
  const displayed = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: '[User unavailable]' },
          { type: 'text', text: ' see ' },
          { type: 'text', text: '[Market unavailable]' },
          { type: 'text', text: '[Market unavailable]' },
        ],
      },
    ],
  }
  const edit = getSocialEditContent(stored, displayed)
  expect(edit?.content?.[0].content).toEqual([
    {
      type: 'mention',
      attrs: {
        id: 'mentioned',
        label: '[User unavailable]',
        unavailable: true,
      },
    },
    { type: 'text', text: ' see ' },
    {
      type: 'contract-mention',
      attrs: { id: 'market', label: '[Market unavailable]', unavailable: true },
    },
    { type: 'text', text: '[Market unavailable]' },
  ])
  expect(JSON.stringify(edit)).not.toMatch(/forged-name|javascript:forged/)
  expect(getSocialEditContent(null, null)).toBeNull()
})

test('reads still redact structured references beyond current authoring limits', async () => {
  const richContent = textToSocialRichContent('x'.repeat(2000))
  richContent.content![0].content!.push(
    ...Array.from({ length: 11 }, (_, i) => ({
      type: 'mention',
      attrs: { id: `old-user-${i}`, label: `old-user-${i}` },
    })),
    ...Array.from({ length: 6 }, (_, i) => ({
      type: 'contract-mention',
      attrs: { id: `old-market-${i}`, label: `/private/old-market-${i}` },
    }))
  )
  const row = {
    ...post,
    id: 'root',
    root_id: 'root',
    parent_id: null,
    created_time: '2026-09-21T00:00:00Z',
    rich_content: richContent,
    text: 'stale fallback /private/old-market',
  } as SocialRow
  const pg = db({
    manyOrNone: jest.fn(async (sql: string) => {
      if (sql.includes('select id, name, username, data'))
        return [
          { id: row.user_id, name: 'Author', username: 'author', data: {} },
        ]
      if (sql.includes('select * from social_posts')) return [row]
      return []
    }),
  })
  const [hydrated] = await hydrateSocialPosts(pg, [row], { blocked: [] }, false)
  expect(hydrated.richContent).not.toBeNull()
  expect(hydrated.text).toBe(
    'x'.repeat(2000) +
      '[User unavailable]'.repeat(11) +
      '[Market unavailable]'.repeat(6)
  )
  expect(JSON.stringify(hydrated)).not.toMatch(
    /private|old-user|old-market|stale fallback/
  )
  expect(hydrated).not.toHaveProperty('editContent')
})

test('edits preserve unavailable mentions, ignore forged labels, and allow their removal', async () => {
  const pg = db({ manyOrNone: jest.fn().mockResolvedValue([]) })
  const edits = getSocialEditContent(mentionedContent, {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: '[User unavailable]' },
          { type: 'text', text: ' see ' },
          { type: 'text', text: '[Market unavailable]' },
        ],
      },
    ],
  })!
  edits.content![0].content!.push({ type: 'text', text: ' edited' })
  edits.content![0].content![0].attrs!.label = 'forged replacement'
  const saved = await validateSocialRichContent(
    pg,
    edits,
    { blocked: [] },
    mentionedContent
  )
  expect(saved?.content?.[0].content?.[0]).toEqual(
    mentionedContent.content![0].content![0]
  )
  expect(saved?.content?.[0].content?.[2]).toEqual(
    mentionedContent.content![0].content![2]
  )
  expect(JSON.stringify(saved)).not.toContain('unavailable')
  expect(socialRichContentToText(saved!)).toBe(
    '@forged-name see %javascript:forged edited'
  )
  const removed = textToSocialRichContent('Replaced the references')
  await expect(
    validateSocialRichContent(pg, removed, { blocked: [] }, mentionedContent)
  ).resolves.toEqual(removed)
})

test.each(['mention', 'contract-mention'])(
  'rejects new, forged and duplicated unavailable %s references',
  async (type) => {
    const existing = mentionedContent.content![0].content!.find(
      (node) => node.type === type
    )!
    const doc = (...content: SocialRichContent[]): SocialRichContent => ({
      type: 'doc',
      content: [{ type: 'paragraph', content }],
    })
    const unavailable = {
      ...existing,
      attrs: { ...existing.attrs, label: 'unavailable', unavailable: true },
    }
    const pg = db({ manyOrNone: jest.fn().mockResolvedValue([]) })
    await expect(
      validateSocialRichContent(pg, doc(unavailable), { blocked: [] })
    ).rejects.toMatchObject({ code: 400 })
    for (const submitted of [
      doc({
        ...unavailable,
        attrs: { ...unavailable.attrs, id: 'new-hidden' },
      }),
      doc(unavailable, unavailable),
    ])
      await expect(
        validateSocialRichContent(
          pg,
          submitted,
          { blocked: [] },
          mentionedContent
        )
      ).rejects.toMatchObject({ code: 400 })
  }
)

test('available mentions are canonicalized again and ignore unavailable flags', async () => {
  const pg = db({
    manyOrNone: jest.fn(async (sql: string) =>
      sql.includes('from users')
        ? [{ id: 'mentioned', username: 'renamed-user' }]
        : [mentionedMarket]
    ),
  })
  const incoming = JSON.parse(
    JSON.stringify(mentionedContent)
  ) as SocialRichContent
  incoming.content![0].content![0].attrs!.unavailable = true
  incoming.content![0].content![2].attrs!.unavailable = true
  const saved = await validateSocialRichContent(pg, incoming, { blocked: [] })
  expect(saved?.content?.[0].content?.[0].attrs).toEqual({
    id: 'mentioned',
    label: 'renamed-user',
  })
  expect(saved?.content?.[0].content?.[2].attrs).toEqual({
    id: 'market',
    label: '/owner/real-market',
  })
  const edit = getSocialEditContent(mentionedContent, saved)
  expect(edit).toEqual(saved)
})

test('blocked mentions can only be retained from the same stored post', async () => {
  const pg = db({
    manyOrNone: jest.fn(async (sql: string) =>
      sql.includes('from users')
        ? [{ id: 'mentioned', username: 'new-name' }]
        : [mentionedMarket]
    ),
  })
  const saved = await validateSocialRichContent(
    pg,
    mentionedContent,
    { blocked: ['mentioned'] },
    mentionedContent
  )
  expect(saved?.content?.[0].content?.[0]).toEqual(
    mentionedContent.content![0].content![0]
  )
})

test('restored references still enforce the authored character limit', async () => {
  const pg = db({ manyOrNone: jest.fn().mockResolvedValue([]) })
  const incoming = textToSocialRichContent('x'.repeat(1990))
  incoming.content![0].content!.push({
    type: 'mention',
    attrs: { id: 'mentioned', label: '', unavailable: true },
  })
  await expect(
    validateSocialRichContent(pg, incoming, { blocked: [] }, mentionedContent)
  ).rejects.toMatchObject({ code: 400 })
})
test('hides untrusted, removed, and blocked post images', async () => {
  const image = `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_CONFIG.storageBucket}/o/user-images%2Fauthor%2Fyap%2Fimage.png?alt=media&token=test-token`
  for (const state of ['visible', 'deleted', 'blocked'] as const) {
    const row = {
      ...post,
      id: 'root',
      root_id: 'root',
      parent_id: null,
      created_time: '2026-09-16 00:00:00+00',
      deleted_time: state === 'deleted' ? '2026-09-16 01:00:00+00' : null,
      image_urls: [image, 'https://tracker.example/pixel.png'],
    } as SocialRow
    const pg = db({
      manyOrNone: jest
        .fn()
        .mockResolvedValueOnce([
          { id: row.user_id, name: 'Author', username: 'author', data: {} },
        ])
        .mockResolvedValueOnce([row])
        .mockResolvedValue([]),
    })
    const [result] = await hydrateSocialPosts(
      pg,
      [row],
      {
        blocked: state === 'blocked' ? [row.user_id] : [],
      },
      false
    )
    expect(result.imageUrls).toEqual(state === 'visible' ? [image] : [])
    expect(result.removed).toBe(
      state === 'visible' ? null : state === 'blocked' ? 'blocked' : 'author'
    )
  }
})
test('membership comes from authoritative entitlements, and expiry does not block author access', async () => {
  jest.mocked(getUser).mockResolvedValue({
    id: 'u',
    entitlements: [{ enabled: true, entitlementId: SUPPORTER_TIERS.basic.id }],
  } as User)
  jest.mocked(getActiveSupporterEntitlements).mockResolvedValue([])
  await expect(socialAuthor('u', true)).rejects.toMatchObject({ code: 403 })
  await expect(socialAuthor('u')).resolves.toMatchObject({ id: 'u' })
  for (const tier of ['basic', 'plus', 'premium'] as const) {
    jest.mocked(getActiveSupporterEntitlements).mockResolvedValue([
      {
        enabled: true,
        entitlementId: SUPPORTER_TIERS[tier].id,
        grantedTime: 1,
        userId: 'u',
        autoRenew: false,
      },
    ])
    await expect(socialAuthor('u', true)).resolves.toMatchObject({ id: 'u' })
  }
})
test('blocks work in both directions and protect root authors from nested replies', async () => {
  jest.mocked(getPrivateUser).mockResolvedValue({
    blockedUserIds: ['a'],
    blockedByUserIds: ['b', 'a'],
  } as never)
  expect((await getSocialViewer('u')).blocked).toEqual(['a', 'b'])
  const pg = db({
    oneOrNone: jest
      .fn()
      .mockResolvedValue({ id: 'root', user_id: 'root-author' }),
  })
  for (const blocked of [['parent-author'], ['root-author']]) {
    await expect(
      assertSocialInteraction(pg, post, { id: 'u', blocked }, true)
    ).rejects.toMatchObject({ code: 403 })
  }
  await expect(
    assertSocialInteraction(pg, post, { id: 'u', blocked: [] }, true)
  ).resolves.toBeUndefined()
})
test('root deletion closes replies while a removed target rejects all new interactions', async () => {
  const pg = db({
    oneOrNone: jest.fn().mockResolvedValue({ id: 'root', deleted_time: 'now' }),
  })
  await expect(
    assertSocialInteraction(pg, post, { blocked: [] }, true)
  ).rejects.toMatchObject({ code: 403 })
  await expect(
    assertSocialInteraction(
      pg,
      { ...post, deleted_time: 'now' },
      { blocked: [] }
    )
  ).rejects.toMatchObject({ code: 403 })
})
test('unavailable markets and mismatched repost source are rejected', async () => {
  await expect(
    validateSocialMarkets(
      db({ manyOrNone: jest.fn().mockResolvedValue([{ id: 'a' }]) }),
      ['a', 'private']
    )
  ).rejects.toMatchObject({ code: 400 })
  await expect(
    validateSocialSource(db({}), { contractId: 'other' }, ['a'], {
      blocked: [],
    })
  ).rejects.toMatchObject({ code: 400 })
  await expect(
    validateSocialSource(
      db({ oneOrNone: jest.fn().mockResolvedValue(null) }),
      { contractId: 'a', commentId: 'hidden' },
      ['a'],
      { blocked: [] }
    )
  ).rejects.toMatchObject({ code: 400 })
})
test('database rate-limit exhaustion returns 429', async () => {
  await expect(
    limitSocialWrite(
      db({ oneOrNone: jest.fn().mockResolvedValue(null) }),
      'u',
      'post',
      10
    )
  ).rejects.toMatchObject({ code: 429 })
})
test('social notifications suppress self, blocks, and opt-outs and use reply content', async () => {
  const actor = { id: 'actor', name: 'Actor', username: 'actor' } as User
  await notifySocial(db({}), { ...post, user_id: 'actor' }, actor, 'like')
  expect(insertNotificationToSupabase).not.toHaveBeenCalled()
  jest.mocked(getPrivateUser).mockResolvedValue({
    blockedUserIds: ['actor'],
    blockedByUserIds: [],
  } as never)
  await notifySocial(db({}), post, actor, 'like')
  expect(insertNotificationToSupabase).not.toHaveBeenCalled()
  jest.mocked(getPrivateUser).mockResolvedValue({
    blockedUserIds: [],
    blockedByUserIds: [],
    notificationPreferences: { opt_out_all: [], social_replies: [] },
  } as never)
  await notifySocial(db({}), post, actor, 'reply', 'new-reply')
  expect(insertNotificationToSupabase).not.toHaveBeenCalled()
  jest.mocked(getPrivateUser).mockResolvedValue({
    blockedUserIds: [],
    blockedByUserIds: [],
    notificationPreferences: { opt_out_all: [], social_replies: ['browser'] },
  } as never)
  await notifySocial(
    db({
      oneOrNone: jest
        .fn()
        .mockResolvedValue({ ...post, id: 'new-reply', text: 'actual reply' }),
    }),
    post,
    actor,
    'reply',
    'new-reply'
  )
  expect(insertNotificationToSupabase).toHaveBeenCalledWith(
    expect.objectContaining({
      sourceText: 'actual reply',
      sourceSlug: '/yap/new-reply',
      sourceType: 'social_reply',
    }),
    expect.anything()
  )
})

test('Yap reposts reject missing, deleted, and blocked originals, including reply root blocks', async () => {
  const original = { ...post, root_id: 'root' }
  const root = { ...post, id: 'root', user_id: 'root-author' }
  const pg = (target: SocialRow | null) =>
    db({
      oneOrNone: jest.fn((_sql, [id]) =>
        Promise.resolve(id === 'reply' ? target : root)
      ),
    })
  await expect(
    validateSocialSource(pg(null), { postId: 'reply' }, [], { blocked: [] })
  ).rejects.toMatchObject({ code: 404 })
  await expect(
    validateSocialSource(
      pg({ ...original, deleted_time: 'now' }),
      { postId: 'reply' },
      [],
      { blocked: [] }
    )
  ).rejects.toMatchObject({ code: 403 })
  for (const blocked of [['parent-author'], ['root-author']]) {
    await expect(
      validateSocialSource(pg(original), { postId: 'reply' }, [], { blocked })
    ).rejects.toMatchObject({ code: 403 })
  }
  await expect(
    validateSocialSource(pg(original), { postId: 'reply' }, [], { blocked: [] })
  ).resolves.toBeUndefined()
})
