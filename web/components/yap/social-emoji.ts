import { Extension, InputRule } from '@tiptap/core'
import shortcodes from '../editor/emoji/github-shortcodes.json'

export function getSocialEmoji(shortcode: string): string | undefined {
  const name = shortcode.toLowerCase()
  const alias =
    name === 'laugh' ? 'laughing' : name === '-1' ? 'thumbsdown' : name
  const encoded = shortcodes[alias as keyof typeof shortcodes]
  if (typeof encoded !== 'string') return undefined
  const points = encoded.split(' ').map((point) => Number.parseInt(point, 16))
  const isModifier = (point: number) => point >= 0x1f3fb && point <= 0x1f3ff
  const isFlag = points.every((point) => point >= 0x1f1e6 && point <= 0x1f1ff)
  // The shared map strips joiners and presentation selectors. Reconstruct
  // fully qualified emoji while keeping flags, tags, keycaps, and skin tones
  // together. https://unicode.org/reports/tr51/#Emoji_Implementation_Notes
  return String.fromCodePoint(
    ...points.flatMap((point, index) => {
      const character = String.fromCodePoint(point)
      const needsJoiner =
        index > 0 &&
        !isFlag &&
        point !== 0x20e3 &&
        !(point >= 0xe0020 && point <= 0xe007f) &&
        !isModifier(point)
      const needsEmojiPresentation =
        /\p{Emoji}/u.test(character) &&
        !/\p{Emoji_Presentation}/u.test(character) &&
        !isModifier(points[index + 1])
      return [
        ...(needsJoiner ? [0x200d] : []),
        point,
        ...(needsEmojiPresentation ? [0xfe0f] : []),
      ]
    })
  )
}

export const SocialEmoji = Extension.create({
  name: 'socialEmoji',
  addInputRules() {
    return [
      new InputRule({
        find: (text) => {
          // Input rules also run on Enter; only a closing colon converts text.
          if (!text.endsWith(':')) return null
          const match = /(^|\s):([a-z0-9_+-]+):$/i.exec(text)
          if (!match) return null
          const emoji = getSocialEmoji(match[2])
          if (!emoji) return null
          return {
            index: match.index,
            text: match[0],
            data: { emoji, prefixLength: match[1].length },
          }
        },
        handler: ({ state, range, match }) => {
          const from = range.from + (match.data?.prefixLength ?? 0)
          if (from > range.to) return null
          const link = state.schema.marks.link
          if (
            link &&
            (state.storedMarks?.some((mark) => mark.type === link) ||
              state.doc.rangeHasMark(from, range.to, link))
          )
            return null
          state.tr.insertText(match.data?.emoji, from, range.to)
        },
      }),
    ]
  },
})
