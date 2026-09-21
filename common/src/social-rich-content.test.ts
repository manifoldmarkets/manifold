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

test('normalizes formatting and derives fallback text from rich content', () => {
  const rich = doc(
    { type: 'text', text: 'Hello ', marks: [{ type: 'bold' }] },
    { type: 'mention', attrs: { id: 'alice-id', label: 'alice' } },
    { type: 'hardBreak' },
    {
      type: 'contract-mention',
      attrs: { id: 'market', label: '/bob/question' },
    },
    {
      type: 'text',
      text: ' link',
      marks: [
        {
          type: 'link',
          attrs: {
            href: 'https://example.com',
            target: '_blank',
            rel: 'ugc',
            class: 'anything',
          },
        },
      ],
    }
  )
  const parsed = socialPostDraftSchema.parse({
    text: 'forged fallback',
    richContent: rich,
  })
  expect(parsed.text).toBe('Hello @alice\n%/bob/question link')
  expect(parsed.richContent?.content?.[0].content?.[4].marks).toEqual([
    { type: 'link', attrs: { href: 'https://example.com' } },
  ])
  expect(getSocialMentionIds(parsed.richContent)).toEqual(['alice-id'])
  expect(getSocialMarketMentionIds(parsed.richContent)).toEqual(['market'])
})

test('preserves plain multiline drafts and nested list and quote text', () => {
  expect(socialRichContentToText(textToSocialRichContent('one\n\ntwo'))).toBe(
    'one\n\ntwo'
  )
  const rich = {
    type: 'doc',
    content: [
      {
        type: 'blockquote',
        content: [
          {
            type: 'orderedList',
            attrs: { start: 3 },
            content: [
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'item' }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  }
  expect(socialRichContentToText(socialRichContentSchema.parse(rich))).toBe(
    'item'
  )
  expect(
    socialPostDraftSchema.parse({ text: 'legacy' }).richContent
  ).toBeUndefined()
})

test('removes link marks from mentions so their own links cannot be nested', () => {
  const parsed = socialRichContentSchema.parse(
    doc({
      type: 'mention',
      attrs: { id: 'user', label: 'user' },
      marks: [
        { type: 'bold' },
        { type: 'link', attrs: { href: 'https://example.com' } },
      ],
    })
  )
  expect(parsed.content?.[0].content?.[0].marks).toEqual([{ type: 'bold' }])
})

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

test.each(['image', 'iframe', 'heading', 'codeBlock', 'html', 'tweet'])(
  'rejects unsupported %s nodes',
  (type) => {
    expect(
      socialRichContentSchema.safeParse(
        doc({ type, attrs: { src: 'https://external.example/image' } })
      ).success
    ).toBe(false)
  }
)

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
  for (let i = 0; i < 14; i++)
    nested = { type: 'blockquote', content: [nested] }
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
