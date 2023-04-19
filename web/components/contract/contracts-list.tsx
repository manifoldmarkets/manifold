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
import { ContractStatusLabel, ContractsListEntry } from './contracts-list-entry'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { Avatar } from '../widgets/avatar'

const contractListEntryHighlightClass =
  'bg-gradient-to-b from-primary-100 via-ink-0to-ink-0outline outline-2 outline-primary-400'
export function ContractsList(props: {
  contracts: Contract[] | undefined
  loadMore?: () => Promise<boolean>
  onContractClick?: (contract: Contract) => void
  highlightContractIds?: string[]
  skinny?: boolean
}) {
  const { contracts, loadMore, onContractClick, highlightContractIds, skinny } =
    props

  const isMobile = useIsMobile()

  if (contracts === undefined) {
    return <LoadingIndicator />
  }

  return (
    <Col>
      {/* {contracts.map((contract) =>
        isMobile ? (
          <ContractsListEntry
            contract={contract}
            key={contract.id}
            onContractClick={onContractClick}
            skinny={true}
            className={
              highlightContractIds?.includes(contract.id)
                ? contractListEntryHighlightClass
                : ''
            }
          />
        ) : (
          <DesktopPopover
            contract={contract}
            key={contract.id}
            onContractClick={onContractClick}
            highlightContractIds={highlightContractIds}
            skinny={skinny}
          />
        )
      )} */}
        <table>
      <thead className="text-left text-sm text-ink-600 font-semibold">
        <tr>
          <th></th>
          <th>Market</th>
          <th></th>
          <th>Traders</th>
        </tr>
      </thead>
      <tbody>
        {contracts.map((contract) => (
          <tr key={contract.id}>
        <td className="pr-4 py-2"><Avatar
          username={contract.creatorUsername}
          avatarUrl={contract.creatorAvatarUrl}
          size="xs"/></td>
            <td className="pr-4">{contract.question}</td>
            <td>
              <div className="min-w-[2rem] font-semibold mr-2"><ContractStatusLabel contract={contract} /></div>
            </td>
            <td>
              {contract.uniqueBettorCount}
            </td>
          </tr>
        ))}
      </tbody>
    </table>

      {loadMore && (
        <LoadMoreUntilNotVisible
          loadMore={loadMore}
          className="relative -top-96 h-1"
        />
      )}
    </Col>
  )
}

function DesktopPopover(props: {
  contract: Contract
  onContractClick?: (contract: Contract) => void
  highlightContractIds?: string[]
  skinny?: boolean
}) {
  const { contract, onContractClick, highlightContractIds, skinny } = props
  const [isOpen, setIsOpen] = useState(false)
  const { x, y, strategy, refs, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement: 'bottom-end',
    middleware: [flip()],
  })
  const hover = useHover(context, {
    mouseOnly: true,
    handleClose: safePolygon({ buffer: -Infinity }),
  })
  const { getReferenceProps, getFloatingProps } = useInteractions([hover])
  return (
    <>
      <ContractsListEntry
        ref={refs.setReference}
        contract={contract}
        onContractClick={onContractClick}
        skinny={skinny}
        className={
          highlightContractIds?.includes(contract.id)
            ? contractListEntryHighlightClass
            : ''
        }
        {...getReferenceProps()}
      />
      {isOpen && (
        <div
          ref={refs.setFloating}
          style={{
            position: strategy,
            top: y ?? 0,
            left: x ?? 0,
            width: 'max-content',
          }}
          {...getFloatingProps()}
        >
          <ContractCard
            contract={contract}
            showImage
            showDescription
            className="z-30 w-[350px]"
          />
        </div>
      )}
    </>
  )
}
