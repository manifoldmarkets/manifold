import type { MentionOptions } from '@tiptap/extension-mention'
import { ReactRenderer } from '@tiptap/react'
import { beginsWith } from 'common/util/parse'
import { sortBy, uniqBy } from 'lodash'
import tippy from 'tippy.js'
import { getDisplayUsers, searchUsers } from 'web/lib/supabase/users'
import { MentionList } from './mention-list'
type Render = Suggestion['render']

type Suggestion = MentionOptions['suggestion']

// copied from https://tiptap.dev/api/nodes/mention#usage
export const mentionSuggestion: Suggestion = {
  allowedPrefixes: [' '],
  items: async ({ query }) =>
    sortBy(await searchUsers(query, 6), (u) =>
      [u.name, u.username].some((s) => beginsWith(s, query)) ? -1 : 0
    ),
  render: makeMentionRender(MentionList),
}

export function createMentionSuggestion(
  priorityUserIds?: string[]
): Suggestion {
  return {
    allowedPrefixes: [' '],
    items: async ({ query }) => {
      const lowerQuery = query.toLowerCase()

      // Fetch search results and priority users in parallel
      const [searchResults, priorityUsers] = await Promise.all([
        searchUsers(query, 6),
        priorityUserIds?.length ? getDisplayUsers(priorityUserIds) : [],
      ])

      // Filter priority users to those matching the query
      const matchingPriorityUsers = priorityUsers.filter(
        (u) =>
          u.name?.toLowerCase().includes(lowerQuery) ||
          u.username?.toLowerCase().includes(lowerQuery)
      )

      // Merge priority users with search results, removing duplicates (priority users first)
      const allUsers = uniqBy(
        [...matchingPriorityUsers, ...searchResults],
        'id'
      )

      return sortBy(allUsers, (u) => {
        // Priority users (e.g., contract creator, commenters) come first
        // Earlier in the array = higher priority (more negative = sorted first)
        if (priorityUserIds) {
          const priorityIndex = priorityUserIds.indexOf(u.id)
          if (priorityIndex !== -1) {
            // Use negative index so first in array gets lowest (most negative) sort value
            return -1000 + priorityIndex
          }
        }
        // Then users whose name/username starts with query
        if ([u.name, u.username].some((s) => beginsWith(s, query))) return -1
        return 0
      }).slice(0, 6)
    },
    render: makeMentionRender(MentionList),
  }
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
