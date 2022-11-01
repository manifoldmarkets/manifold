import Mention from '@tiptap/extension-mention'
import {
  mergeAttributes,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from '@tiptap/react'
import { Linkify } from '../widgets/linkify'
import { mentionSuggestion } from './mention-suggestion'

const name = 'mention-component'

const MentionComponent = (props: any) => {
  return (
    <NodeViewWrapper className={name}>
      <Linkify text={'@' + props.node.attrs.label} />
    </NodeViewWrapper>
  )
}

/**
 *  Mention extension that renders React. See:
 *  https://tiptap.dev/guide/custom-extensions#extend-existing-extensions
 *  https://tiptap.dev/guide/node-views/react#render-a-react-component
 */
export const DisplayMention = Mention.extend({
  parseHTML: () => [{ tag: name }],
  renderHTML: ({ HTMLAttributes }) => [name, mergeAttributes(HTMLAttributes)],
  addNodeView: () =>
    ReactNodeViewRenderer(MentionComponent, { className: 'inline-block' }),
}).configure({ suggestion: mentionSuggestion })
