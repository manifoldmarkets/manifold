import { Contract } from 'common/contract'
import { ContractCard } from './contract-card'
import { Col } from '../layout/col'
import Tippy from '@tippyjs/react'
import { VisibilityObserver } from '../widgets/visibility-observer'
import { useCallback } from 'react'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { ContractsListEntry } from './contracts-list-entry'
import { useIsMobile } from 'web/hooks/use-is-mobile'

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
        <DesktopPopover contract={contract} key={contract.id}></DesktopPopover>
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

function DesktopPopover(props: { contract: Contract }) {
  const { contract } = props
  const isMobile = useIsMobile()
  if (isMobile) {
    return <ContractsListEntry contract={contract} />
  }

  return (
    <Tippy
      interactive
      duration={0}
      placement="bottom-end"
      content={
        <ContractCard
          contract={contract}
          showImage
          showDescription
          className="w-[350px]"
        />
      }
    >
      <span tabIndex={0}>
        <ContractsListEntry contract={contract} />
      </span>
    </Tippy>
  )
}
