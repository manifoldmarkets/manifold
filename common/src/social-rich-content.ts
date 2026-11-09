import type { JSONContent } from '@tiptap/core'
import { z } from 'zod'

export type SocialRichContent = JSONContent

const MAX_DEPTH = 12
const MAX_NODES = 1000
const MAX_JSON_BYTES = 64 * 1024
const MAX_TEXT_LENGTH = 2000
const inlineTypes = new Set([
  'text',
  'hardBreak',
  'mention',
  'contract-mention',
])

const fail = (message: string): never => {
  throw new Error(message)
}

const createSocialRichContentSchema = (limitAuthoring: boolean) =>
  z.unknown().transform((value, ctx) => {
    try {
      const serialized = JSON.stringify(value)
      if (
        !serialized ||
        new TextEncoder().encode(serialized).length > MAX_JSON_BYTES
      )
        fail('Post content must be smaller than 64 KB')
      let count = 0
      const normalize = (input: unknown, depth: number): SocialRichContent => {
        if (depth > MAX_DEPTH || ++count > MAX_NODES)
          fail('Post content is too complex')
        if (!input || typeof input !== 'object' || Array.isArray(input))
          return fail('Invalid post content node')
        const node = input as JSONContent
        const type = node.type
        if (
          !type ||
          (!inlineTypes.has(type) && type !== 'doc' && type !== 'paragraph')
        )
          return fail('Unsupported post formatting')
        if ((depth === 0) !== (type === 'doc')) fail('Invalid post document')
        const result: SocialRichContent = { type }
        if (type === 'text') {
          if (typeof node.text !== 'string' || !node.text.length)
            fail('Text nodes must contain text')
          result.text = node.text
        }
        if (type === 'mention' || type === 'contract-mention') {
          const { id, label } = node.attrs ?? {}
          if (
            typeof id !== 'string' ||
            !id.length ||
            id.length > 200 ||
            typeof label !== 'string' ||
            label.length > 512
          )
            fail('Invalid post mention')
          result.attrs = { id, label }
          if (node.attrs?.unavailable === true) result.attrs.unavailable = true
        }
        if (node.marks !== undefined)
          fail('Post content does not support formatting marks')
        if (inlineTypes.has(type)) {
          if (node.content?.length)
            fail('Inline post nodes cannot contain children')
        } else {
          if (node.content !== undefined && !Array.isArray(node.content))
            fail('Invalid post content')
          const content = (node.content ?? []).map((child) =>
            normalize(child, depth + 1)
          )
          const allowed =
            type === 'paragraph' ? inlineTypes : new Set(['paragraph'])
          if (content.some((child) => !allowed.has(child.type!)))
            fail('Invalid post structure')
          result.content = content
        }
        return result
      }
      const doc = normalize(value, 0)
      if (
        limitAuthoring &&
        [...socialRichContentToText(doc)].length > MAX_TEXT_LENGTH
      )
        fail('Posts can contain up to 2,000 characters')
      if (limitAuthoring && getSocialMentionIds(doc).length > 10)
        fail('Posts can mention up to 10 people')
      if (limitAuthoring && getSocialMarketMentionIds(doc).length > 5)
        fail('Posts can reference up to 5 markets')
      return doc
    } catch (error) {
      ctx.addIssue({
        code: 'custom',
        message:
          error instanceof Error ? error.message : 'Invalid post content',
      })
      return z.NEVER
    }
  })

export const socialRichContentSchema = createSocialRichContentSchema(true)
// Authoring limits must not discard previously accepted content on reads.
// Keep structural, depth, node and byte limits for safe rendering.
export const socialRichContentDisplaySchema =
  createSocialRichContentSchema(false)

export function socialRichContentToText(doc: SocialRichContent): string {
  const visit = (node: SocialRichContent): string => {
    if (node.type === 'text') return node.text ?? ''
    if (node.type === 'hardBreak') return '\n'
    if (
      (node.type === 'mention' || node.type === 'contract-mention') &&
      node.attrs?.unavailable
    )
      return socialUnavailableMentionText(node.type)
    if (node.type === 'mention') return `@${node.attrs?.label ?? ''}`
    if (node.type === 'contract-mention') return `%${node.attrs?.label ?? ''}`
    return (node.content ?? [])
      .map(visit)
      .join(node.type === 'paragraph' ? '' : '\n')
  }
  return visit(doc).trim()
}

export const socialUnavailableMentionText = (type: string) =>
  type === 'mention' ? '[User unavailable]' : '[Market unavailable]'

export function hasUnavailableSocialMentions(
  doc: SocialRichContent | null | undefined
): boolean {
  return !!(
    ((doc?.type === 'mention' || doc?.type === 'contract-mention') &&
      doc.attrs?.unavailable) ||
    doc?.content?.some(hasUnavailableSocialMentions)
  )
}

export function textToSocialRichContent(text: string): SocialRichContent {
  return {
    type: 'doc',
    content: text.split('\n').map((line) => ({
      type: 'paragraph',
      content: line ? [{ type: 'text', text: line }] : [],
    })),
  }
}

function mentionIds(
  doc: SocialRichContent | null | undefined,
  type: string
): string[] {
  const ids = new Set<string>()
  const visit = (node: SocialRichContent) => {
    if (node.type === type && typeof node.attrs?.id === 'string')
      ids.add(node.attrs.id)
    node.content?.forEach(visit)
  }
  if (doc) visit(doc)
  return [...ids]
}

const isMentionNode = (node: JSONContent) =>
  (node.type === 'mention' || node.type === 'contract-mention') &&
  typeof node.attrs?.id === 'string' &&
  typeof node.attrs?.label === 'string'

const isHttpUrl = (value: unknown): value is string =>
  typeof value === 'string' && /^https?:\/\//i.test(value)

// Where an embedded video, link preview or tweet points, so the Yap keeps it.
const embedUrl = (node: JSONContent): string | undefined => {
  const attrs = node.attrs ?? {}
  if (node.type === 'iframe' && isHttpUrl(attrs.src)) return attrs.src
  if (node.type === 'linkPreview' && isHttpUrl(attrs.url)) return attrs.url
  if (node.type === 'tiptapTweet' && typeof attrs.tweetId === 'string') {
    // Stored with a leading 't' so the id is not parsed as a number.
    const id = attrs.tweetId.replace(/^t/, '')
    if (/^\d+$/.test(id)) return `https://twitter.com/i/status/${id}`
  }
  return undefined
}

// Yap links visible URLs only, so a link on other words keeps its address.
const withLinkTarget = (node: JSONContent) => {
  const href = node.marks?.find((mark) => mark.type === 'link')?.attrs?.href
  return isHttpUrl(href) && href !== node.text
    ? `${node.text} (${href})`
    : node.text
}

// Seed a Yap draft from a market comment draft. Paragraphs, line breaks and
// mentions carry over; other formatting is flattened to its text, links and
// embeds keep their address as a visible URL, and images are dropped. Returns
// null when the result is not valid Yap content.
export function commentToSocialRichContent(
  comment: JSONContent
): SocialRichContent | null {
  const inline = (node: JSONContent): JSONContent[] =>
    node.type === 'text'
      ? node.text
        ? [{ type: 'text', text: withLinkTarget(node) }]
        : []
      : node.type === 'hardBreak'
      ? [{ type: 'hardBreak' }]
      : isMentionNode(node)
      ? [
          {
            type: node.type,
            attrs: { id: node.attrs!.id, label: node.attrs!.label },
          },
        ]
      : (node.content ?? []).flatMap(inline)
  const blocks = (node: JSONContent): JSONContent[] => {
    if (node.type === 'paragraph' || node.type === 'heading')
      return [{ type: 'paragraph', content: inline(node) }]
    const url = embedUrl(node)
    if (url)
      return [{ type: 'paragraph', content: [{ type: 'text', text: url }] }]
    return (node.content ?? []).flatMap((child) =>
      inlineTypes.has(child.type ?? '')
        ? [{ type: 'paragraph', content: inline(child) }]
        : blocks(child)
    )
  }
  const content = blocks(comment)
  if (!content.some((p) => p.content?.length)) return null
  const parsed = socialRichContentSchema.safeParse({ type: 'doc', content })
  return parsed.success ? parsed.data : null
}

// Visible HTTP(S) URLs, without trailing sentence punctuation. Yap renders
// these as links at display time; comments need explicit link marks.
const URL_PATTERN = /https?:\/\/[^\s<>"']*[^\s<>"'.,;:!?)\]]/gi

const linkify = (text: string): JSONContent[] => {
  const nodes: JSONContent[] = []
  let last = 0
  const pattern = new RegExp(URL_PATTERN)
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text))) {
    const start = match.index
    if (start > last)
      nodes.push({ type: 'text', text: text.slice(last, start) })
    nodes.push({
      type: 'text',
      text: match[0],
      marks: [{ type: 'link', attrs: { href: match[0] } }],
    })
    last = start + match[0].length
  }
  if (last < text.length) nodes.push({ type: 'text', text: text.slice(last) })
  return nodes
}

// The market comment posted alongside a Yap. Yap nodes are a subset of the
// comment editor's, so the document carries over; URLs gain link marks and
// attached images follow the text.
export function socialPostToCommentContent(post: {
  text: string
  richContent?: SocialRichContent | null
  imageUrls?: string[]
}): JSONContent {
  const visit = (node: JSONContent): JSONContent[] =>
    node.type === 'text'
      ? linkify(node.text ?? '')
      : [
          {
            ...node,
            ...(node.content ? { content: node.content.flatMap(visit) } : {}),
          },
        ]
  const doc = post.richContent ?? textToSocialRichContent(post.text)
  return {
    type: 'doc',
    content: [
      ...(doc.content ?? []).flatMap(visit),
      ...(post.imageUrls ?? []).map((src) => ({
        type: 'image',
        attrs: { src },
      })),
    ],
  }
}

export const getSocialMentionIds = (doc?: SocialRichContent | null) =>
  mentionIds(doc, 'mention')
export const getSocialMarketMentionIds = (doc?: SocialRichContent | null) =>
  mentionIds(doc, 'contract-mention')
