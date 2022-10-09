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
import { cloneDeep, uniq } from 'lodash'
import { TiptapSpoiler } from './tiptap-spoiler'

/** get first url in text. like "notion.so " -> "http://notion.so"; "notion" -> null */
export function getUrl(text: string) {
  const results = find(text, 'url')
  return results.length ? results[0].href : null
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
  Mention.extend({ name: 'contract-mention' }),
  Iframe,
  TiptapTweet,
  TiptapSpoiler,
]

export function richTextToString(text?: JSONContent) {
  if (!text) return ''
  // remove spoiler tags.
  const newText = cloneDeep(text)
  dfs(newText, (current) => {
    if (current.marks?.some((m) => m.type === TiptapSpoiler.name)) {
      current.text = '[spoiler]'
    } else if (current.type === 'image') {
      current.text = '[Image]'
      // This is a hack, I've no idea how to change a tiptap extenstion's schema
      current.type = 'text'
    } else if (current.type === 'iframe') {
      const src = current.attrs?.['src'] ? current.attrs['src'] : ''
      current.text = '[Iframe]' + (src ? ` url:${src}` : '')
      // This is a hack, I've no idea how to change a tiptap extenstion's schema
      current.type = 'text'
    }
  })
  return generateText(newText, exhibitExts)
}

const dfs = (data: JSONContent, f: (current: JSONContent) => any) => {
  data.content?.forEach((d) => dfs(d, f))
  f(data)
}
