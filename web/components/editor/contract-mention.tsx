import Mention from '@tiptap/extension-mention'
import {
  mergeAttributes,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from '@tiptap/react'
import clsx from 'clsx'
import { useContract } from 'web/hooks/use-contract'
import { ContractCard } from '../contract/contract-card'

const name = 'contract-mention-component'

const ContractMentionComponent = (props: any) => {
  const contract = useContract(props.node.attrs.id)

  return (
    <NodeViewWrapper className={clsx(name, 'not-prose')}>
      {contract && (
        <ContractCard
          contract={contract}
          className="my-2 w-full border border-gray-100"
        />
      )}
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
      className: 'inline-block sm:w-[calc(50%-1rem)] sm:mr-1',
    }),
})
