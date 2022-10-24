import Mention from '@tiptap/extension-mention'
import {
  mergeAttributes,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from '@tiptap/react'
import clsx from 'clsx'
import { ContractMention } from 'web/components/contract/contract-mention'
import Link from 'next/link'
import { contractMentionSuggestion } from './contract-mention-suggestion'
import { useContract } from 'web/hooks/use-contracts'

const name = 'contract-mention-component'

const ContractMentionComponent = (props: any) => {
  const { label, id } = props.node.attrs
  const contract = useContract(id)

  return (
    <NodeViewWrapper className={clsx(name, 'not-prose inline')}>
      {contract ? (
        <ContractMention contract={contract} />
      ) : label ? (
        <Link href={label}>
          <a className="rounded-sm !text-indigo-700 hover:bg-indigo-50">
            {label}
          </a>
        </Link>
      ) : (
        '[loading...]'
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
  addNodeView: () => ReactNodeViewRenderer(ContractMentionComponent),
}).configure({ suggestion: contractMentionSuggestion })
