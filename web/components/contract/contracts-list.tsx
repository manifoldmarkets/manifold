import { Contract } from 'common/contract'
import { Col } from '../layout/col'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { LoadMoreUntilNotVisible } from '../widgets/visibility-observer'
import { ContractsTable } from './contracts-table'
import {
  actionColumn,
  probColumn,
  traderColumn,
} from './contract-table-col-formats'
import { buildArray } from 'common/util/array'

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

  return (
    <Col>
      {contracts === undefined ? (
        <LoadingIndicator />
      ) : (
        <ContractsTable
          contracts={contracts}
          onContractClick={onContractClick}
          highlightContractIds={highlightContractIds}
          columns={buildArray([
            traderColumn,
            probColumn,
            !hideActions && actionColumn,
          ])}
          headerClassName={headerClassName}
        />
      )}
      {loadMore && <LoadMoreUntilNotVisible loadMore={loadMore} />}
    </Col>
  )
}
