import { MAX_TAG_LENGTH } from '../contract'
import { generateText, JSONContent } from '@tiptap/core'
// Tiptap starter extensions
import { Blockquote } from '@tiptap/extension-blockquote'
import { Bold } from '@tiptap/extension-bold'
import { BulletList } from '@tiptap/extension-bullet-list'
import { Code } from '@tiptap/extension-code'
import { CodeBlock } from '@tiptap/extension-code-block'
import { Document } from '@tiptap/extension-document'
import { HardBreak } from '@tiptap/extension-hard-break'
import { Heading } from '@tiptap/extension-heading'
import { History } from '@tiptap/extension-history'
import { HorizontalRule } from '@tiptap/extension-horizontal-rule'
import { Italic } from '@tiptap/extension-italic'
import { ListItem } from '@tiptap/extension-list-item'
import { OrderedList } from '@tiptap/extension-ordered-list'
import { Paragraph } from '@tiptap/extension-paragraph'
import { Strike } from '@tiptap/extension-strike'
import { Text } from '@tiptap/extension-text'
// other tiptap extensions
import { Image } from '@tiptap/extension-image'
import { Link } from '@tiptap/extension-link'
import Iframe from './tiptap-iframe'

export function parseTags(text: string) {
  const regex = /(?:^|\s)(?:[#][a-z0-9_]+)/gi
  const matches = (text.match(regex) || []).map((match) =>
    match.trim().substring(1).substring(0, MAX_TAG_LENGTH)
  )
  const tagSet = new Set()
  const uniqueTags: string[] = []
  // Keep casing of last tag.
  matches.reverse()
  for (const tag of matches) {
    const lowercase = tag.toLowerCase()
    if (!tagSet.has(lowercase)) {
      tagSet.add(lowercase)
      uniqueTags.push(tag)
    }
  }
  uniqueTags.reverse()
  return uniqueTags
}

export function parseWordsAsTags(text: string) {
  const taggedText = text
    .split(/\s+/)
    .map((tag) => (tag.startsWith('#') ? tag : `#${tag}`))
    .join(' ')
  return parseTags(taggedText)
}

// TODO: fuzzy matching
export const wordIn = (word: string, corpus: string) =>
  corpus.toLocaleLowerCase().includes(word.toLocaleLowerCase())

const checkAgainstQuery = (query: string, corpus: string) =>
  query.split(' ').every((word) => wordIn(word, corpus))

export const searchInAny = (query: string, ...fields: string[]) =>
  fields.some((field) => checkAgainstQuery(query, field))

// can't just do [StarterKit, Image...] because it doesn't work with cjs imports
export const exhibitExts = [
  Blockquote,
  Bold,
  BulletList,
  Code,
  CodeBlock,
  Document,
  HardBreak,
  Heading,
  History,
  HorizontalRule,
  Italic,
  ListItem,
  OrderedList,
  Paragraph,
  Strike,
  Text,

  Image,
  Link,
  Iframe,
]
// export const exhibitExts = [StarterKit as unknown as Extension, Image]

export function richTextToString(text?: JSONContent) {
  return !text ? '' : generateText(text, exhibitExts)
}
