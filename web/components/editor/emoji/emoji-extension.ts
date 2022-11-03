import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import { PluginKey } from 'prosemirror-state'
import { emojiSuggestion } from './emoji-suggestion'
import { emojis } from '@tiptap-pro/extension-emoji'

export const EmojiPluginKey = new PluginKey('emoji')

export const EmojiExtension = Extension.create({
  name: 'emoji',

  addStorage() {
    return { emojis }
  },

  addProseMirrorPlugins() {
    return [Suggestion({ editor: this.editor, ...emojiSuggestion })]
  },
})
