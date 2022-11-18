import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import { PluginKey } from 'prosemirror-state'
import { emojiSuggestion } from './emoji-suggestion'
import { EmojiItem, emojis as ttEmojis } from '@tiptap-pro/extension-emoji'
import { ENV_CONFIG } from 'common/envs/constants'

export const EmojiPluginKey = new PluginKey('emoji')

const emojis: EmojiItem[] = [
  ...ttEmojis,
  {
    name: 'mana',
    shortcodes: ['m$, mana'],
    tags: ['money'],
    emoji: ENV_CONFIG.moneyMoniker,
  },
]

export const EmojiExtension = Extension.create({
  name: 'emoji',

  addStorage() {
    return { emojis }
  },

  addProseMirrorPlugins() {
    return [Suggestion({ editor: this.editor, ...emojiSuggestion })]
  },
})
