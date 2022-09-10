import Mention from '@tiptap/extension-mention'
import {
  mergeAttributes,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from '@tiptap/react'
import clsx from 'clsx'
import { useContract } from 'web/hooks/use-contract'
import { ContractCard } from '../contract/contract-card'

const name = 'mention-component'

const MentionComponent = (props: any) => {
  const contract = useContract(props.node.attrs.id)

  return (
    <NodeViewWrapper className={clsx(name, 'not-prose text-indigo-700')}>
      {/* <Linkify text={'@' + props.node.attrs.label} /> */}
      {contract && <ContractCard contract={contract} />}
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
})
