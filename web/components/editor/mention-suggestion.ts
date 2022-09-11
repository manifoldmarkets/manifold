import type { MentionOptions } from '@tiptap/extension-mention'
import { ReactRenderer } from '@tiptap/react'
import { searchInAny } from 'common/util/parse'
import { orderBy } from 'lodash'
import tippy from 'tippy.js'
import { getCachedContracts } from 'web/hooks/use-contracts'
// import { getCachedUsers } from 'web/hooks/use-users'
import { MentionList } from './mention-list'

type Suggestion = MentionOptions['suggestion']

const beginsWith = (text: string, query: string) =>
  text.toLocaleLowerCase().startsWith(query.toLocaleLowerCase())

// copied from https://tiptap.dev/api/nodes/mention#usage
export const mentionSuggestion: Suggestion = {
  char: '%',
  allowSpaces: true,
  items: async ({ query }) =>
    orderBy(
      (await getCachedContracts()).filter((c) =>
        searchInAny(query, c.question)
      ),
      [(c) => [c.question].some((s) => beginsWith(s, query))],
      ['desc', 'desc']
    ).slice(0, 5),
  render: () => {
    let component: ReactRenderer
    let popup: ReturnType<typeof tippy>
    return {
      onStart: (props) => {
        component = new ReactRenderer(MentionList, {
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
        if (props.event.key === 'Escape') {
          popup?.[0].hide()
          return true
        }
        return (component?.ref as any)?.onKeyDown(props)
      },
      onExit() {
        popup?.[0].destroy()
        component?.destroy()
      },
    }
  },
}
