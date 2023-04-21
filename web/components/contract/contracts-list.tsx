import {
  useFloating,
  useHover,
  useInteractions,
  safePolygon,
  flip,
} from '@floating-ui/react'

import { Contract } from 'common/contract'
import { ContractCard } from './contract-card'
import { Col } from '../layout/col'
import { LoadMoreUntilNotVisible } from '../widgets/visibility-observer'
import { useState } from 'react'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { ContractStatusLabel, ContractsTableEntry } from './contracts-table'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { Avatar } from '../widgets/avatar'
import { filter } from '../supabase-search'
const contractListEntryHighlightClass =
  'bg-gradient-to-b from-primary-100 via-ink-0to-ink-0outline outline-2 outline-primary-400'
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
  console.log('MOBILE', isMobile)

  if (contracts === undefined) {
    return <LoadingIndicator />
  }

  return (
    <Col>
      <ContractsTableEntry
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
