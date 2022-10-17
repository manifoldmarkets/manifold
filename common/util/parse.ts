import { generateText, JSONContent, Node } from '@tiptap/core'
import { generateJSON } from '@tiptap/html'
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

// TODO: this is a hack to get around the fact that tiptap doesn't have a
// way to add a node view without bundling in tsx
function skippableComponent(name: string): Node<any, any> {
  return Node.create({
    name,

    group: 'block',

    content: 'inline*',

    parseHTML() {
      return [
        {
          tag: 'grid-cards-component',
        },
      ]
    },
  })
}

const stringParseExts = [
  // StarterKit extensions
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
  // other extensions
  Link,
  Image.extend({ renderText: () => '[image]' }),
  Mention, // user @mention
  Mention.extend({ name: 'contract-mention' }), // market %mention
  Iframe.extend({
    renderText: ({ node }) =>
      '[embed]' + node.attrs.src ? `(${node.attrs.src})` : '',
  }),
  skippableComponent('gridCardsComponent'),
  skippableComponent('staticReactEmbedComponent'),
  TiptapTweet.extend({ renderText: () => '[tweet]' }),
  TiptapSpoiler.extend({ renderHTML: () => ['span', '[spoiler]', 0] }),
]

export function richTextToString(text?: JSONContent) {
  if (!text) return ''
  return generateText(text, stringParseExts)
}

export function htmlToRichText(html: string) {
  return generateJSON(html, stringParseExts)
}
