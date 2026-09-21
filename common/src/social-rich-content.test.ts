import {
  getSocialMarketMentionIds,
  getSocialMentionIds,
  SocialRichContent,
  socialRichContentSchema,
  socialRichContentDisplaySchema,
  socialRichContentToText,
  textToSocialRichContent,
} from './social-rich-content'
import { socialPostDraftSchema } from './social-post'

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
