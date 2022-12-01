import { mergeAttributes, Node } from '@tiptap/core'
import React from 'react'
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

  renderReact(attrs: any) {
    return <GridComponent {...attrs} />
  },
})

function GridComponent(attrs: any) {
  const { contractIds } = attrs

  const contracts = useContracts(contractIds.split(','))
  const loaded = contracts.every((c) => c !== undefined)

  return (
    <div className=" not-prose font-normal">
      {loaded ? (
        <ContractsGrid
          contracts={filterDefined(contracts)}
          breakpointColumns={{ default: 2, 650: 1 }}
        />
      ) : (
        <LoadingIndicator />
      )}
    </div>
  )
}
