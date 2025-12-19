import { mergeAttributes } from '@tiptap/core'
import Mention from '@tiptap/extension-mention'
import {
  createMentionSuggestion,
  mentionSuggestion,
} from './mention-suggestion'
import { UserMention } from './user-mention'

const name = 'mention-component'

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
})

export const DisplayMention = BaseMention.configure({
  suggestion: mentionSuggestion,
})

export function createDisplayMention(priorityUserIds?: string[]) {
  return BaseMention.configure({
    suggestion: createMentionSuggestion(priorityUserIds),
  })
}
