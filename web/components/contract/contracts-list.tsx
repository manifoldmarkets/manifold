import { Contract } from 'common/contract'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { Col } from '../layout/col'
import { filter } from '../supabase-search'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { LoadMoreUntilNotVisible } from '../widgets/visibility-observer'
import { ContractsTable } from './contracts-table'

export function ContractsList(props: {
  contracts: Contract[] | undefined
  filter?: filter
  loadMore?: () => Promise<boolean>
  onContractClick?: (contract: Contract) => void
  highlightContractIds?: string[]
  skinny?: boolean
  headerClassName?: string
}) {
  const {
    contracts,
    filter,
    loadMore,
    onContractClick,
    highlightContractIds,
    skinny,
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
        filter={filter}
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
