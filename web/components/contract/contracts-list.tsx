import { Contract } from 'common/contract'
import { Col } from '../layout/col'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { LoadMoreUntilNotVisible } from '../widgets/visibility-observer'
import { ContractsTable } from './contracts-table'

export function ContractsList(props: {
  contracts: Contract[] | undefined
  loadMore?: () => Promise<boolean>
  onContractClick?: (contract: Contract) => void
  highlightContractIds?: string[]
  hideActions?: boolean
  headerClassName?: string
}) {
  const {
    contracts,
    loadMore,
    onContractClick,
    highlightContractIds,
    hideActions,
    headerClassName,
  } = props

  if (contracts === undefined) {
    return <LoadingIndicator />
  }

  return (
    <Col>
      <ContractsTable
        contracts={contracts}
        onContractClick={onContractClick}
        highlightContractIds={highlightContractIds}
        hideActions={hideActions}
        headerClassName={headerClassName}
      />
      {loadMore && <LoadMoreUntilNotVisible loadMore={loadMore} />}
    </Col>
  )
}
