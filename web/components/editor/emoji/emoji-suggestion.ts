import { ReactRenderer } from '@tiptap/react'
import { SuggestionOptions } from '@tiptap/suggestion'
import {
  EmojiSuggestionPluginKey,
  EmojiItem,
} from '@tiptap-pro/extension-emoji'
import { beginsWith, searchInAny } from 'common/util/parse'
import tippy from 'tippy.js'
import { EmojiList } from './emoji-list'
import { orderBy } from 'lodash'
type Render = Suggestion['render']

type Suggestion = Omit<SuggestionOptions, 'editor'>

// first 100 most popular emoji from https://home.unicode.org/emoji/emoji-frequency/
const ranking =
  '😂❤️🤣👍😭🙏😘🥰😍😊🎉😁💕🥺😅🔥☺️🤦♥️🤷🙄😆🤗😉🎂🤔👏🙂😳🥳😎👌💜😔💪✨💖👀😋😏😢👉💗😩💯🌹💞🎈💙😃😡💐😜🙈🤞😄🤤🙌🤪❣️😀💋💀👇💔😌💓🤩🙃😬😱😴🤭😐🌞😒😇🌸😈🎶✌️🎊🥵😞💚☀️🖤💰😚👑🎁💥🙋☹️😑🥴👈💩✅'

const rank = (c: string) => {
  const r = ranking.indexOf(c)
  return r < 0 ? 101 : r
}

// copied from mention-suggestion.ts, which is copied from https://tiptap.dev/api/nodes/mention#usage
export const emojiSuggestion: Suggestion = {
  char: ':',
  pluginKey: EmojiSuggestionPluginKey,
  allowedPrefixes: [' '],
  items: ({ editor, query }) => {
    const emojis: EmojiItem[] = editor.storage.emoji.emojis
    if (query.endsWith(':')) {
      return emojis.filter(({ shortcodes }) =>
        shortcodes.includes(query.slice(0, -1))
      )
    }

    const matches = emojis.filter(({ shortcodes, tags, emoticons = [] }) =>
      searchInAny(query, ...shortcodes, ...tags, ...emoticons)
    )

    return orderBy(
      matches,
      [
        (e) => rank(e.emoji ?? ''),
        (e) =>
          e.shortcodes.some((s) => beginsWith(s, query)) ||
          e.emoticons?.some((s) => beginsWith(s, query)),
      ],
      ['asc', 'desc']
    ).slice(0, 5)
  },

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
