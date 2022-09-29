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
import { Mention } from '@tiptap/extension-mention'
import Iframe from './tiptap-iframe'
import TiptapTweet from './tiptap-tweet-type'
import { find } from 'linkifyjs'
import { uniq } from 'lodash'
import { TiptapSpoiler } from './tiptap-spoiler'

/** get first url in text. like "notion.so " -> "http://notion.so"; "notion" -> null */
export function getUrl(text: string) {
  const results = find(text, 'url')
  return results.length ? results[0].href : null
}

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

/** @return user ids of all \@mentions */
export function parseMentions(data: JSONContent): string[] {
  const mentions = data.content?.flatMap(parseMentions) ?? [] //dfs
  if (data.type === 'mention' && data.attrs) {
    mentions.push(data.attrs.id as string)
  }
  return uniq(mentions)
}

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
  Mention,
  Iframe,
  TiptapTweet,
  TiptapSpoiler,
]

export function richTextToString(text?: JSONContent) {
  return !text ? '' : generateText(text, exhibitExts)
}
