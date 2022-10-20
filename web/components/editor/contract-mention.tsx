import Mention from '@tiptap/extension-mention'
import {
  mergeAttributes,
  nodePasteRule,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from '@tiptap/react'
import clsx from 'clsx'
import { useContract } from 'web/hooks/use-contract'
import { ContractMention } from 'web/components/contract/contract-mention'
import Link from 'next/link'
import { contractMentionSuggestion } from './contract-mention-suggestion'
import { getContractFromSlug } from 'web/lib/firebase/contracts'
import { useEffect, useState } from 'react'

const name = 'contract-mention-component'

const ContractMentionComponent = (props: any) => {
  const { label, id } = props.node.attrs
  const idContract = useContract(id ?? ' ')
  const [contract, setContract] = useState(idContract)

  useEffect(() => {
    ;(async () => {
      if (!id) {
        const contract = await getContractFromSlug(label.split('/')[1])
        if (contract) {
          setContract(contract)
          props.id = contract.id
        }
      }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
  addPasteRules() {
    return [
      nodePasteRule({
        find: /^(?:https?:\/\/)?manifold\.markets\/(?:(?!group|post|charity|date-docs))(\w*\/[\w-]*)(?:\?[\w&=]*)?$/g,
        type: this.type,
        getAttributes: (match) => ({ label: match[1] }),
      }),
    ]
  },
}).configure({ suggestion: contractMentionSuggestion })
