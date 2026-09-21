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

const createSocialRichContentSchema = (limitText: boolean) =>
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
          error instanceof Error ? error.message : 'Invalid post content',
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
