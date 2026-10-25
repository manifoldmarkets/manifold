import { InputRule, mergeAttributes } from '@tiptap/core'
import Mention from '@tiptap/extension-mention'
import { MODS_USER_ID } from 'common/envs/constants'
import {
  createMentionSuggestion,
  mentionSuggestion,
} from './mention-suggestion'
import { UserMention } from './user-mention'

const name = 'mention-component'

// "@mods" followed by anything that can't be in a username. Newlines are left
// alone so Enter still picks from the suggestion dropdown.
const modsMentionRegex = /(?:^|\s)@mods([^\w\n])$/i

/**
 *  Mention extension that renders React. See:
 *  https://tiptap.dev/guide/custom-extensions#extend-existing-extensions
 *  https://tiptap.dev/guide/node-views/react#render-a-react-component
 */
const BaseMention = Mention.extend({
  parseHTML: () => [{ tag: name }, { tag: `span[data-type="${name}"]` }],
  renderHTML: ({ node, HTMLAttributes }) => [
    'span',
    mergeAttributes({ 'data-type': name }, HTMLAttributes),
    '@' + (node.attrs.label ?? ''),
  ],
  renderReact: (attrs: any) => <UserMention userName={attrs.label} />,
  // Tag mods even if the user types past the dropdown instead of selecting it
  addInputRules() {
    return [
      new InputRule({
        find: modsMentionRegex,
        handler: ({ state, range, match }) => {
          const { tr, selection } = state
          // The just-typed character isn't in the doc yet, so "@mods" ends at range.to
          const from = range.to - '@mods'.length
          // Bail if text is selected or part of "@mods" arrived with this input
          if (
            !selection.empty ||
            from < range.from ||
            // Compositionend runs after insertion; batched input can include
            // part of the token. Only replace a complete token already in the doc.
            state.doc.textBetween(from, range.to).toLowerCase() !== '@mods'
          )
            return null
          tr.replaceWith(
            from,
            range.to,
            this.type.create({ id: MODS_USER_ID, label: 'mods' })
          ).insertText(match[1])
        },
      }),
    ]
  },
})

export const DisplayMention = BaseMention.configure({
  suggestion: mentionSuggestion,
})

export function createDisplayMention(priorityUserIds?: string[]) {
  return BaseMention.configure({
    suggestion: createMentionSuggestion(priorityUserIds),
  })
}
