import { mergeAttributes, Node } from '@tiptap/core'
import React from 'react'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { ContractsGrid } from '../contract/contracts-grid'

import { LoadingIndicator } from '../widgets/loading-indicator'
import { useContracts } from 'web/hooks/use-contracts'
import { filterDefined } from 'common/util/array'

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
  const contracts = useContracts(contractIds.split(','))
  const loaded = contracts.every((c) => c !== undefined)

  return (
    <NodeViewWrapper className="grid-cards-component not-prose">
      {loaded ? (
        <ContractsGrid
          contracts={filterDefined(contracts)}
          breakpointColumns={{ default: 2, 650: 1 }}
        />
      ) : (
        <LoadingIndicator />
      )}
    </NodeViewWrapper>
  )
}
