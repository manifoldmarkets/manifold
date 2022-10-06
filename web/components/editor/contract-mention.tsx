import Mention from '@tiptap/extension-mention'
import {
  mergeAttributes,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from '@tiptap/react'
import clsx from 'clsx'
import { useContract } from 'web/hooks/use-contract'
import { ContractMention } from '../contract/contract-mention'

const name = 'contract-mention-component'

const ContractMentionComponent = (props: any) => {
  const contract = useContract(props.node.attrs.id)

  return (
    <NodeViewWrapper className={clsx(name, 'not-prose inline')}>
      {contract && <ContractMention contract={contract} />}
    </NodeViewWrapper>
  )
}

/**
 *  Mention extension that renders React. See:
 *  https://tiptap.dev/guide/custom-extensions#extend-existing-extensions
 *  https://tiptap.dev/guide/node-views/react#render-a-react-component
 */
export const DisplayContractMention = Mention.extend({
  name: 'contract-mention',
  parseHTML: () => [{ tag: name }],
  renderHTML: ({ HTMLAttributes }) => [name, mergeAttributes(HTMLAttributes)],
  addNodeView: () =>
    ReactNodeViewRenderer(ContractMentionComponent, {
      // On desktop, render cards below half-width so you can stack two
    }),
})
