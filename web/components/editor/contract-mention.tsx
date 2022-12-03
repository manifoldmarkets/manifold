import Mention from '@tiptap/extension-mention'
import { ContractMention as LoadedContractMention } from 'web/components/contract/contract-mention'
import Link from 'next/link'
import { contractMentionSuggestion } from './contract-mention-suggestion'
import { useContract } from 'web/hooks/use-contracts'
import { mergeAttributes } from '@tiptap/core'

const name = 'contract-mention-component'

const ContractMention = (attrs: any) => {
  const { label, id } = attrs
  const contract = useContract(id)

  return (
    <span className="not-prose">
      {contract ? (
        <LoadedContractMention contract={contract} />
      ) : label ? (
        <Link
          href={label}
          className="rounded-sm !text-indigo-700 hover:bg-indigo-50"
        >
          {label}
        </Link>
      ) : (
        '[loading...]'
      )}
    </span>
  )
}

/**
 *  Mention extension that renders React. See:
 *  https://tiptap.dev/guide/custom-extensions#extend-existing-extensions
 *  https://tiptap.dev/guide/node-views/react#render-a-react-component
 */
export const DisplayContractMention = Mention.extend({
  name: 'contract-mention',
  parseHTML: () => [{ tag: 'name' }, { tag: `a[data-type="${name}"]` }],
  renderHTML: ({ HTMLAttributes }) => [
    name,
    mergeAttributes(HTMLAttributes),
    0,
  ],

  renderReact: (attrs: any) => <ContractMention {...attrs} />,
}).configure({ suggestion: contractMentionSuggestion })
