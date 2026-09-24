import {
  getSocialMarketMentionIds,
  getSocialMentionIds,
  hasUnavailableSocialMentions,
  SocialRichContent,
  socialRichContentSchema,
  socialRichContentDisplaySchema,
  socialRichContentToText,
  textToSocialRichContent,
} from './social-rich-content'
import { socialPostDraftSchema, socialPostEditSchema } from './social-post'

const doc = (...content: SocialRichContent[]): SocialRichContent => ({
  type: 'doc',
  content: [{ type: 'paragraph', content }],
})

test('derives fallback text from plain text, emoji, URLs and mentions', () => {
  const rich = doc(
    { type: 'text', text: 'Hello 😀 ' },
    { type: 'mention', attrs: { id: 'alice-id', label: 'alice' } },
    { type: 'hardBreak' },
    {
      type: 'contract-mention',
      attrs: { id: 'market', label: '/bob/question' },
    },
    {
      type: 'text',
      text: ' https://example.com',
    }
  )
  const parsed = socialPostDraftSchema.parse({
    text: 'forged fallback',
    richContent: rich,
  })
  expect(parsed.text).toBe(
    'Hello 😀 @alice\n%/bob/question https://example.com'
  )
  expect(parsed.richContent?.content?.[0].content?.[4].marks).toBeUndefined()
  expect(getSocialMentionIds(parsed.richContent)).toEqual(['alice-id'])
  expect(getSocialMarketMentionIds(parsed.richContent)).toEqual(['market'])
})

test('preserves plain multiline drafts and legacy content', () => {
  expect(socialRichContentToText(textToSocialRichContent('one\n\ntwo'))).toBe(
    'one\n\ntwo'
  )
  expect(
    socialRichContentSchema.parse(textToSocialRichContent('one\n\ntwo'))
  ).toEqual(textToSocialRichContent('one\n\ntwo'))
  expect(
    socialPostDraftSchema.parse({ text: 'legacy' }).richContent
  ).toBeUndefined()
})

test.each(['bold', 'italic', 'strike', 'code', 'link', 'underline'])(
  'rejects %s marks on text and mentions',
  (type) => {
    for (const node of [
      { type: 'text', text: 'text' },
      { type: 'mention', attrs: { id: 'user', label: 'user' } },
      {
        type: 'contract-mention',
        attrs: { id: 'market', label: '/owner/market' },
      },
    ]) {
      const content = doc({
        ...node,
        marks: [{ type, attrs: { href: 'https://example.com' } }],
      })
      expect(socialRichContentSchema.safeParse(content).success).toBe(false)
      expect(socialRichContentDisplaySchema.safeParse(content).success).toBe(
        false
      )
    }
  }
)

test('display validation retains content expanded by current mention labels or redaction', () => {
  for (const suffix of [
    '[User unavailable]',
    '[Market unavailable]',
    '@renamed-user',
  ]) {
    const content = textToSocialRichContent('x'.repeat(1990) + suffix)
    expect(socialRichContentSchema.safeParse(content).success).toBe(false)
    expect(socialRichContentDisplaySchema.safeParse(content).success).toBe(true)
  }
  expect(
    socialRichContentDisplaySchema.safeParse(doc({ type: 'image' })).success
  ).toBe(false)
})

test.each([
  ['mention', 'private-user-name', '[User unavailable]'],
  [
    'contract-mention',
    '/private-owner/private-question',
    '[Market unavailable]',
  ],
])(
  'keeps unavailable %s identity for edits without exposing its label in plain text',
  (type, label, placeholder) => {
    const rich = doc(
      { type: 'text', text: 'Before ' },
      { type, attrs: { id: 'hidden-reference', label, unavailable: true } },
      { type: 'text', text: ' after' }
    )
    for (const schema of [
      socialRichContentSchema,
      socialRichContentDisplaySchema,
    ]) {
      const parsed = schema.parse(rich)
      expect(parsed.content?.[0].content?.[1].attrs).toEqual({
        id: 'hidden-reference',
        label,
        unavailable: true,
      })
      expect(socialRichContentToText(parsed)).toBe(
        `Before ${placeholder} after`
      )
      expect(socialRichContentToText(parsed)).not.toContain(label)
      expect(hasUnavailableSocialMentions(parsed)).toBe(true)
    }
    expect(
      hasUnavailableSocialMentions(
        doc({ type, attrs: { id: 'visible-reference', label } })
      )
    ).toBe(false)
    // Literal placeholder text has no reference for the server to restore.
    expect(
      hasUnavailableSocialMentions(textToSocialRichContent(placeholder))
    ).toBe(false)
  }
)

test.each(['mention', 'contract-mention'])(
  'accepts expanded unavailable %s text only through the rich edit request boundary',
  (type) => {
    const rich = doc(
      { type: 'text', text: 'x'.repeat(1990) },
      {
        type,
        attrs: { id: 'retained-reference', label: '', unavailable: true },
      }
    )
    const edited = socialPostEditSchema.parse({
      text: 'untrusted client fallback',
      richContent: rich,
    })
    expect([...edited.text].length).toBeGreaterThan(2000)
    expect(edited.text).not.toContain('untrusted client fallback')
    expect(hasUnavailableSocialMentions(edited.richContent)).toBe(true)
    expect(
      socialPostDraftSchema.safeParse({ text: '', richContent: rich }).success
    ).toBe(false)
    for (const richContent of [undefined, null]) {
      expect(
        socialPostEditSchema.safeParse({ text: edited.text, richContent })
          .success
      ).toBe(false)
    }
  }
)

test('plain-text edits still enforce the same Unicode length boundary as creation', () => {
  for (const schema of [socialPostDraftSchema, socialPostEditSchema]) {
    expect(schema.safeParse({ text: '😀'.repeat(2000) }).success).toBe(true)
    expect(schema.safeParse({ text: '😀'.repeat(2001) }).success).toBe(false)
  }
})

test.each([
  ['mention', 10, getSocialMentionIds],
  ['contract-mention', 5, getSocialMarketMentionIds],
] as const)(
  'preserves existing %s references beyond the current authoring limit',
  (type, limit, getIds) => {
    const rich = doc(
      ...Array.from({ length: limit + 1 }, (_, i) => ({
        type,
        attrs: { id: `retained-${i}`, label: `label-${i}` },
      }))
    )
    const displayed = socialRichContentDisplaySchema.parse(rich)
    expect(getIds(displayed)).toHaveLength(limit + 1)
    expect(socialRichContentToText(displayed)).toContain(`label-${limit}`)
    expect(socialRichContentSchema.safeParse(rich).success).toBe(false)
    expect(
      socialPostDraftSchema.safeParse({ text: '', richContent: rich }).success
    ).toBe(false)
  }
)

test.each([
  'image',
  'iframe',
  'heading',
  'codeBlock',
  'html',
  'tweet',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
])('rejects unsupported %s nodes', (type) => {
  expect(
    socialRichContentSchema.safeParse(
      doc({ type, attrs: { src: 'https://external.example/image' } })
    ).success
  ).toBe(false)
})

test.each([
  'javascript:alert(1)',
  'data:text/html,hi',
  '//example.com',
  '/local',
  'https://user:secret@example.com',
])('rejects unsafe link %s', (href) => {
  expect(
    socialRichContentSchema.safeParse(
      doc({
        type: 'text',
        text: 'link',
        marks: [{ type: 'link', attrs: { href } }],
      })
    ).success
  ).toBe(false)
})

test('enforces text, nesting, node, payload and distinct mention limits', () => {
  expect(
    socialRichContentSchema.safeParse(
      textToSocialRichContent('😀'.repeat(2000))
    ).success
  ).toBe(true)
  expect(
    socialRichContentSchema.safeParse(
      textToSocialRichContent('😀'.repeat(2001))
    ).success
  ).toBe(false)
  let nested: SocialRichContent = { type: 'paragraph' }
  for (let i = 0; i < 14; i++) nested = { type: 'paragraph', content: [nested] }
  expect(
    socialRichContentSchema.safeParse({ type: 'doc', content: [nested] })
      .success
  ).toBe(false)
  expect(
    socialRichContentSchema.safeParse(
      doc(...Array.from({ length: 1000 }, () => ({ type: 'hardBreak' })))
    ).success
  ).toBe(false)
  expect(
    socialRichContentSchema.safeParse({
      ...doc({ type: 'text', text: 'small' }),
      oversized: 'x'.repeat(65536),
    }).success
  ).toBe(false)
  for (const [type, limit] of [
    ['mention', 10],
    ['contract-mention', 5],
  ] as const) {
    const mentions = Array.from({ length: limit }, (_, i) => ({
      type,
      attrs: { id: `id-${i}`, label: `label-${i}` },
    }))
    expect(
      socialRichContentSchema.safeParse(doc(...mentions, mentions[0])).success
    ).toBe(true)
    expect(
      socialRichContentSchema.safeParse(
        doc(...mentions, { type, attrs: { id: 'extra', label: 'extra' } })
      ).success
    ).toBe(false)
  }
})
