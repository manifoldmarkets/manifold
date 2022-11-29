import { Node } from '@tiptap/core'
import React from 'react'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { ContractsGrid } from '../contract/contracts-grid'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { useContracts } from 'web/hooks/use-contracts'
import { filterDefined } from 'common/util/array'
import { DOMAIN } from 'common/envs/constants'

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
      {
        tag: `iframe[data-type="${this.name}"]`,
      },
    ]
  },

  // TODO: begone with this godforesaken hack and render the react component instead
  renderHTML({ HTMLAttributes: { contractIds } }) {
    const ids = contractIds.split(',')

    return [
      'iframe',
      {
        'data-type': this.name,
        height: Math.ceil(ids.length / 2) * 200 + 'px',
        src: `https://${DOMAIN}/embed/grid/${contractIds.split(',').join('/')}`,
        frameborder: 0,
      },
    ]
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
    <NodeViewWrapper className="grid-cards-component not-prose font-normal">
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
