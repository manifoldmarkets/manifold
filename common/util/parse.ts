import { MAX_TAG_LENGTH } from '../contract'
import { generateText, JSONContent, Extension } from '@tiptap/core'
import * as StarterKit from '@tiptap/starter-kit' // needed for cjs import to work on firebase
import { Image } from '@tiptap/extension-image'

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

export function richTextToString(text: JSONContent | string) {
  return typeof text === 'string'
    ? text
    : generateText(text, [StarterKit as unknown as Extension, Image])
}
