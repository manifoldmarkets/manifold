import { Contract } from 'common/contract'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { Col } from '../layout/col'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { LoadMoreUntilNotVisible } from '../widgets/visibility-observer'
import { ContractsTable } from './contracts-table'

export function ContractsList(props: {
  contracts: Contract[] | undefined
  loadMore?: () => Promise<boolean>
  onContractClick?: (contract: Contract) => void
  highlightContractIds?: string[]
  headerClassName?: string
}) {
  const {
    contracts,
    loadMore,
    onContractClick,
    highlightContractIds,
    headerClassName,
  } = props

  const isMobile = useIsMobile()

  if (contracts === undefined) {
    return <LoadingIndicator />
  }

  return (
    <Col>
      <ContractsTable
        contracts={contracts}
        onContractClick={onContractClick}
        isMobile={isMobile}
        highlightContractIds={highlightContractIds}
        headerClassName={headerClassName}
      />

      {loadMore && (
        <LoadMoreUntilNotVisible
          loadMore={loadMore}
          className="relative -top-96 h-1"
        />
      )}
    </Col>
  )
}
