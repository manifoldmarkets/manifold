import { Contract } from 'common/contract'
import { ContractCard } from './contract-card'
import { ContractMention } from './contract-mention'
import { Col } from '../layout/col'
import Tippy from '@tippyjs/react'
import { VisibilityObserver } from '../widgets/visibility-observer'
import { useCallback } from 'react'
import { LoadingIndicator } from '../widgets/loading-indicator'

export function ContractsList(props: {
  contracts: Contract[] | undefined
  loadMore?: () => void
}) {
  const { contracts, loadMore } = props
  const onVisibilityUpdated = useCallback(
    (visible: boolean) => {
      if (visible && loadMore) {
        loadMore()
      }
    },
    [loadMore]
  )

  if (contracts === undefined) {
    return <LoadingIndicator />
  }

  return (
    <Col className="gap-2">
      {contracts.map((contract) => (
        <Tippy
          interactive
          duration={0}
          placement="bottom-end"
          content={<ContractCard contract={contract} key={contract.id} />}
        >
          <span tabIndex={0}>
            <ContractMention contract={contract} />
          </span>
        </Tippy>
      ))}

      {loadMore && (
        <VisibilityObserver
          onVisibilityUpdated={onVisibilityUpdated}
          className="relative -top-96 h-1"
        />
      )}
    </Col>
  )
}
