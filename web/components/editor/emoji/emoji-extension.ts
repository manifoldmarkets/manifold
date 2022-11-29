import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import { PluginKey } from 'prosemirror-state'
import { emojiSuggestion } from './emoji-suggestion'

export const EmojiPluginKey = new PluginKey('emoji')

// {
//   name: 'mana',
//   shortcodes: ['m$, mana'],
//   tags: ['money'],
//   emoji: ENV_CONFIG.moneyMoniker,
// },

export const EmojiExtension = Extension.create({
  name: 'emoji',

  addProseMirrorPlugins() {
    return [Suggestion({ editor: this.editor, ...emojiSuggestion })]
  },
})
