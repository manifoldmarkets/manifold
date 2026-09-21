import type { JSONContent } from '@tiptap/core'
import { z } from 'zod'

export type SocialRichContent = JSONContent

const MAX_DEPTH = 12
const MAX_NODES = 1000
const MAX_JSON_BYTES = 64 * 1024
const MAX_TEXT_LENGTH = 2000
const blockTypes = new Set([
  'paragraph',
  'bulletList',
  'orderedList',
  'blockquote',
])
const inlineTypes = new Set([
  'text',
  'hardBreak',
  'mention',
  'contract-mention',
])
const markTypes = new Set(['bold', 'italic', 'strike', 'code', 'link'])

const fail = (message: string): never => {
  throw new Error(message)
}

const createSocialRichContentSchema = (limitText: boolean) =>
  z.unknown().transform((value, ctx) => {
    try {
      const serialized = JSON.stringify(value)
      if (
        !serialized ||
        new TextEncoder().encode(serialized).length > MAX_JSON_BYTES
      )
        fail('Formatted posts must be smaller than 64 KB')
      let count = 0
      const normalize = (input: unknown, depth: number): SocialRichContent => {
        if (depth > MAX_DEPTH || ++count > MAX_NODES)
          fail('Formatted post is too complex')
        if (!input || typeof input !== 'object' || Array.isArray(input))
          return fail('Invalid formatted post node')
        const node = input as JSONContent
        const type = node.type
        if (
          !type ||
          (!blockTypes.has(type) &&
            !inlineTypes.has(type) &&
            type !== 'doc' &&
            type !== 'listItem')
        )
          return fail('Unsupported post formatting')
        if ((depth === 0) !== (type === 'doc'))
          fail('Invalid formatted post document')
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
        }
        if (type === 'orderedList') {
          const start = node.attrs?.start ?? 1
          if (!Number.isInteger(start) || start < 1 || start > 1_000_000)
            fail('Invalid list start')
          result.attrs = { start }
        }
        if (node.marks !== undefined) {
          if (
            !inlineTypes.has(type) ||
            !Array.isArray(node.marks) ||
            node.marks.length > markTypes.size
          )
            fail('Invalid post formatting marks')
          const seen = new Set<string>()
          result.marks = node.marks
            .map((mark) => {
              if (!mark || !markTypes.has(mark.type) || seen.has(mark.type))
                fail('Unsupported post formatting mark')
              seen.add(mark.type)
              if (mark.type !== 'link') return { type: mark.type }
              const href = mark.attrs?.href
              if (
                typeof href !== 'string' ||
                href.length > 2048 ||
                !/^https?:\/\//i.test(href)
              )
                fail('Invalid post link')
              const url = new URL(href)
              if (
                !['http:', 'https:'].includes(url.protocol) ||
                url.username ||
                url.password
              )
                fail('Post links must use HTTP or HTTPS')
              return { type: 'link', attrs: { href } }
            })
            .filter(
              (mark) =>
                mark.type !== 'link' ||
                (type !== 'mention' && type !== 'contract-mention')
            )
        }
        if (inlineTypes.has(type)) {
          if (node.content?.length)
            fail('Inline post nodes cannot contain children')
        } else {
          if (node.content !== undefined && !Array.isArray(node.content))
            fail('Invalid formatted post content')
          const content = (node.content ?? []).map((child) =>
            normalize(child, depth + 1)
          )
          const allowed =
            type === 'paragraph'
              ? inlineTypes
              : type === 'bulletList' || type === 'orderedList'
              ? new Set(['listItem'])
              : blockTypes
          if (content.some((child) => !allowed.has(child.type!)))
            fail('Invalid formatted post structure')
          if (type === 'listItem' && content[0]?.type !== 'paragraph')
            fail('List items must start with a paragraph')
          if (
            (type === 'bulletList' ||
              type === 'orderedList' ||
              type === 'blockquote') &&
            !content.length
          )
            fail('Post lists and quotes cannot be empty')
          result.content = content
        }
        return result
      }
      const doc = normalize(value, 0)
      if (
        limitText &&
        [...socialRichContentToText(doc)].length > MAX_TEXT_LENGTH
      )
        fail('Posts can contain up to 2,000 characters')
      if (getSocialMentionIds(doc).length > 10)
        fail('Posts can mention up to 10 people')
      if (getSocialMarketMentionIds(doc).length > 5)
        fail('Posts can reference up to 5 markets')
      return doc
    } catch (error) {
      ctx.addIssue({
        code: 'custom',
        message:
          error instanceof Error ? error.message : 'Invalid formatted post',
      })
      return z.NEVER
    }
  })

export const socialRichContentSchema = createSocialRichContentSchema(true)
// Current usernames and unavailable-reference placeholders can expand content
// after a post was accepted. Rendering must retain that safe, complete content.
export const socialRichContentDisplaySchema =
  createSocialRichContentSchema(false)

export function socialRichContentToText(doc: SocialRichContent): string {
  const visit = (node: SocialRichContent): string => {
    if (node.type === 'text') return node.text ?? ''
    if (node.type === 'hardBreak') return '\n'
    if (node.type === 'mention') return `@${node.attrs?.label ?? ''}`
    if (node.type === 'contract-mention') return `%${node.attrs?.label ?? ''}`
    return (node.content ?? [])
      .map(visit)
      .join(node.type === 'paragraph' ? '' : '\n')
  }
  return visit(doc).trim()
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

export const getSocialMentionIds = (doc?: SocialRichContent | null) =>
  mentionIds(doc, 'mention')
export const getSocialMarketMentionIds = (doc?: SocialRichContent | null) =>
  mentionIds(doc, 'contract-mention')
