import {
  commentToSocialRichContent,
  SocialRichContent,
  socialPostToCommentContent,
  socialRichContentSchema,
  socialRichContentToText,
} from './social-rich-content'
import { canCommentFromSocialPost, isSocialMarketSource } from './social-post'
import { richTextToString } from './util/parse'

const mention = { type: 'mention', attrs: { id: 'u1', label: 'alice' } }
const market = {
  type: 'contract-mention',
  attrs: { id: 'c1', label: '/alice/will-it-rain' },
}

describe('Yap to market comment', () => {
  test('keeps paragraphs, breaks and mentions as comment nodes', () => {
    const richContent: SocialRichContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'cc ' }, mention],
        },
        {
          type: 'paragraph',
          content: [market, { type: 'hardBreak' }, { type: 'text', text: 'x' }],
        },
      ],
    }
    const comment = socialPostToCommentContent({ text: '', richContent })
    expect(comment).toEqual(richContent)
    expect(richTextToString(comment)).toContain('cc @alice')
  })

  test('links visible URLs without swallowing trailing punctuation', () => {
    const comment = socialPostToCommentContent({
      text: 'see https://example.com/a?b=1. and (http://x.io)',
    })
    expect(comment.content?.[0].content).toEqual([
      { type: 'text', text: 'see ' },
      {
        type: 'text',
        text: 'https://example.com/a?b=1',
        marks: [{ type: 'link', attrs: { href: 'https://example.com/a?b=1' } }],
      },
      { type: 'text', text: '. and (' },
      {
        type: 'text',
        text: 'http://x.io',
        marks: [{ type: 'link', attrs: { href: 'http://x.io' } }],
      },
      { type: 'text', text: ')' },
    ])
  })

  test('appends attached images after the text, and splits plain-text lines', () => {
    const comment = socialPostToCommentContent({
      text: 'one\ntwo',
      imageUrls: ['https://img/1.png'],
    })
    expect(comment.content).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'one' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'two' }] },
      { type: 'image', attrs: { src: 'https://img/1.png' } },
    ])
  })

  test('only market-sourced Yaps with text or images comment', () => {
    const source = { contractId: 'c1', commentId: 'k1' }
    expect(canCommentFromSocialPost({ text: 'hi' }, source)).toBe(true)
    expect(
      canCommentFromSocialPost({ text: ' ', imageUrls: ['u'] }, source)
    ).toBe(true)
    expect(canCommentFromSocialPost({ text: '  ' }, source)).toBe(false)
    expect(canCommentFromSocialPost({ text: 'hi' }, { postId: 'p1' })).toBe(
      false
    )
    expect(canCommentFromSocialPost({ text: 'hi' }, undefined)).toBe(false)
  })

  test('the market source guard narrows only on the source shape', () => {
    expect(isSocialMarketSource({ contractId: 'c1' })).toBe(true)
    expect(isSocialMarketSource({ postId: 'p1' })).toBe(false)
    expect(isSocialMarketSource(undefined)).toBe(false)
  })
})

describe('market comment draft to Yap', () => {
  test('keeps mentions and flattens other formatting into valid Yap content', () => {
    const converted = commentToSocialRichContent({
      type: 'doc',
      content: [
        { type: 'heading', content: [{ type: 'text', text: 'Title' }] },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'bold',
              marks: [{ type: 'bold' }],
            },
            { type: 'text', text: ' link', marks: [{ type: 'link' }] },
            mention,
          ],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [market] }],
            },
          ],
        },
        { type: 'image', attrs: { src: 'https://img/1.png' } },
        { type: 'iframe', attrs: { src: 'https://youtube.com/x' } },
      ],
    })
    expect(converted).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Title' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'bold' },
            { type: 'text', text: ' link' },
            mention,
          ],
        },
        { type: 'paragraph', content: [market] },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'https://youtube.com/x' }],
        },
      ],
    })
    expect(socialRichContentSchema.safeParse(converted).success).toBe(true)
    expect(socialRichContentToText(converted!)).toBe(
      'Title\nbold link@alice\n%/alice/will-it-rain\nhttps://youtube.com/x'
    )
  })

  test('keeps link targets and embed addresses as visible URLs', () => {
    const link = (text: string, href: string) => ({
      type: 'text',
      text,
      marks: [{ type: 'link', attrs: { href } }],
    })
    const converted = commentToSocialRichContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            link('the docs', 'https://docs.manifold.markets'),
            { type: 'text', text: ' and ' },
            link('https://x.io', 'https://x.io'),
            { type: 'text', text: ' or ' },
            link('this', 'javascript:alert(1)'),
          ],
        },
        { type: 'linkPreview', attrs: { url: 'https://example.com/a' } },
        { type: 'tiptapTweet', attrs: { tweetId: 't123' } },
        { type: 'tiptapTweet', attrs: { tweetId: 'tnope' } },
        { type: 'iframe', attrs: { src: 'javascript:alert(1)' } },
      ],
    })
    expect(converted?.content).toEqual([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'the docs (https://docs.manifold.markets)' },
          { type: 'text', text: ' and ' },
          { type: 'text', text: 'https://x.io' },
          { type: 'text', text: ' or ' },
          { type: 'text', text: 'this' },
        ],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'https://example.com/a' }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'https://twitter.com/i/status/123' }],
      },
    ])
  })

  test('returns null when nothing carries over', () => {
    expect(
      commentToSocialRichContent({
        type: 'doc',
        content: [{ type: 'image', attrs: { src: 'https://img/1.png' } }],
      })
    ).toBeNull()
    expect(commentToSocialRichContent({ type: 'doc', content: [] })).toBeNull()
  })

  test('round-trips through the comment conversion', () => {
    const yap: SocialRichContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [mention, { type: 'text', text: ' hi' }],
        },
      ],
    }
    expect(
      commentToSocialRichContent(
        socialPostToCommentContent({ text: '', richContent: yap })
      )
    ).toEqual(yap)
  })
})
