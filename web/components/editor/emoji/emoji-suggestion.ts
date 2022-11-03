import { ReactRenderer } from '@tiptap/react'
import { SuggestionOptions } from '@tiptap/suggestion'
import {
  EmojiSuggestionPluginKey,
  EmojiItem,
} from '@tiptap-pro/extension-emoji'
import { searchInAny } from 'common/util/parse'
import tippy from 'tippy.js'
import { EmojiList } from './emoji-list'
type Render = Suggestion['render']

type Suggestion = Omit<SuggestionOptions, 'editor'>

// copied from mention-suggestion.ts, which is copied from https://tiptap.dev/api/nodes/mention#usage
export const emojiSuggestion: Suggestion = {
  char: ':',
  pluginKey: EmojiSuggestionPluginKey,
  allowedPrefixes: [' '],
  items: ({ editor, query }) =>
    editor.storage.emoji.emojis
      .filter(({ shortcodes, tags, emoticons = [] }: EmojiItem) =>
        searchInAny(query, ...shortcodes, ...tags, ...emoticons)
      )
      .slice(0, 5),
  render: makeMentionRender(EmojiList),
  command: ({ editor, range, props }) => {
    editor
      .chain()
      .focus()
      .insertContentAt(range, props.emoji + ' ')
      .run()
  },
}

export function makeMentionRender(mentionList: any): Render {
  return () => {
    let component: ReactRenderer
    let popup: ReturnType<typeof tippy>
    return {
      onStart: (props) => {
        component = new ReactRenderer(mentionList, {
          props,
          editor: props.editor,
        })
        if (!props.clientRect) {
          return
        }

        popup = tippy('body', {
          getReferenceClientRect: props.clientRect as any,
          appendTo: () => document.body,
          content: component?.element,
          showOnCreate: true,
          interactive: true,
          trigger: 'manual',
          placement: 'bottom-start',
        })
      },
      onUpdate(props) {
        component?.updateProps(props)

        if (!props.clientRect) {
          return
        }

        popup?.[0].setProps({
          getReferenceClientRect: props.clientRect as any,
        })
      },
      onKeyDown(props) {
        if (props.event.key)
          if (
            props.event.key === 'Escape' ||
            // Also break out of the mention if the tooltip isn't visible
            (props.event.key === 'Enter' && !popup?.[0].state.isShown)
          ) {
            popup?.[0].destroy()
            component?.destroy()
            return false
          }
        return (component?.ref as any)?.onKeyDown(props)
      },
      onExit() {
        popup?.[0].destroy()
        component?.destroy()
      },
    }
  }
}
