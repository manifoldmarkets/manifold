import { mergeAttributes, Node } from '@tiptap/core'
import React from 'react'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { ContractsGrid } from '../contract/contracts-grid'

import { useContractsFromIds } from 'web/hooks/use-contract'
import { LoadingIndicator } from '../widgets/loading-indicator'

export default Node.create({
  name: 'gridCardsComponent',

  group: 'block',

  atom: true,

  addAttributes() {
    return {
      contractIds: [],
    }
  },

  parseHTML() {
    return [
      {
        tag: 'grid-cards-component',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['grid-cards-component', mergeAttributes(HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(GridComponent)
  },
})

export function GridComponent(props: any) {
  const contractIds = props.node.attrs.contractIds
  const contracts = useContractsFromIds(contractIds.split(','))

  return (
    <NodeViewWrapper className="grid-cards-component">
      {contracts ? (
        <ContractsGrid
          contracts={contracts}
          breakpointColumns={{ default: 2, 650: 1 }}
        />
      ) : (
        <LoadingIndicator />
      )}
    </NodeViewWrapper>
  )
}
