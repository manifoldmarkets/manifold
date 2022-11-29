import { ReactRenderer } from '@tiptap/react'
import { SuggestionOptions } from '@tiptap/suggestion'
import { beginsWith, searchInAny } from 'common/util/parse'
import tippy from 'tippy.js'
import { EmojiList } from './emoji-list'
import { invertBy, orderBy } from 'lodash'
import shortcodes from './github-shortcodes.json' // from https://api.github.com/emojis
import { PluginKey } from 'prosemirror-state'
import { ENV_CONFIG } from 'common/envs/constants'

type Suggestion = Omit<SuggestionOptions, 'editor'>
type Render = Suggestion['render']

export interface EmojiData {
  shortcodes: string[] // ['grin']
  character: string // '\ud83d\ude04'
  codePoint: string // '1F604'
}

// first 100 most popular emoji from https://home.unicode.org/emoji/emoji-frequency/
const ranking =
  '😂❤️🤣👍😭🙏😘🥰😍😊🎉😁💕🥺😅🔥☺️🤦♥️🤷🙄😆🤗😉🎂🤔👏🙂😳🥳😎👌💜😔💪✨💖👀😋😏😢👉💗😩💯🌹💞🎈💙😃😡💐😜🙈🤞😄🤤🙌🤪❣️😀💋💀👇💔😌💓🤩🙃😬😱😴🤭😐🌞😒😇🌸😈🎶✌️🎊🥵😞💚☀️🖤💰😚👑🎁💥🙋☹️😑🥴👈💩✅'

const rank = (c: string) => {
  const r = ranking.indexOf(c)
  return r < 0 ? 101 : r
}

const emojiArr = Object.entries(invertBy(shortcodes)).map(
  ([codePoint, shortcodes]) => ({
    codePoint,
    shortcodes,
    character: String.fromCodePoint(
      ...codePoint
        .split(' ')
        .flatMap((s) => [Number(`0x${s}`), 0x200d]) // interleave zero-width joiner
        .slice(0, -1) // remove last joiner
    ),
  })
)

emojiArr.push({
  codePoint: '2133',
  shortcodes: ['mana', 'm$'],
  character: ENV_CONFIG.moneyMoniker,
})

// copied from mention-suggestion.ts, which is copied from https://tiptap.dev/api/nodes/mention#usage
export const emojiSuggestion: Suggestion = {
  char: ':',
  pluginKey: new PluginKey('emoji'),
  allowedPrefixes: [' '],
  items: async ({ query }) => {
    const items = emojiArr.filter((item) =>
      searchInAny(query, ...item.shortcodes)
    )
    return orderBy(
      items,
      [
        (item) => item.shortcodes.some((s) => beginsWith(s, query)),
        (item) => rank(item.character),
      ],
      ['desc', 'asc']
    ).slice(0, 5)
  },

  render: makeMentionRender(EmojiList),
  command: ({ editor, range, props }) => {
    editor
      .chain()
      .focus()
      .insertContentAt(range, props.character + ' ')
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
