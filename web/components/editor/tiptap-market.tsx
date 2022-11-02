import { mergeAttributes, Node } from '@tiptap/core'
import React from 'react'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { ContractSmolView } from 'web/pages/embed/[username]/[contractSlug]'
import { getContractFromSlug } from 'web/lib/firebase/contracts'

export default Node.create({
  name: 'marketChart',
  group: 'block',
  atom: true,
  addAttributes: () => ({ slug: '' }),

  parseHTML: () => [{ tag: 'market-chart' }],
  renderHTML({ HTMLAttributes }) {
    return ['market-chart', mergeAttributes(HTMLAttributes)]
  },

  addNodeView: () => ReactNodeViewRenderer(Component),
})

function Component(props: any) {
  const slug = props.node.attrs.slug

  getContractFromSlug()

  return (
    <NodeViewWrapper classname="market-chart">
      <ContractSmolView contract={} />
    </NodeViewWrapper>
  )
}
