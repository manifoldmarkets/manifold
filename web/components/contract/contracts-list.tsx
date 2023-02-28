import clsx from 'clsx'
import Link from 'next/link'
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
import { VisibilityObserver } from '../widgets/visibility-observer'
import { forwardRef, useCallback, useState } from 'react'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { ContractsListEntry, ContractStatusLabel } from './contracts-list-entry'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useContract } from 'web/hooks/use-contracts'
import { contractPath } from 'web/lib/firebase/contracts'
import { Avatar } from '../widgets/avatar'
import { Row } from '../layout/row'

const contractListEntryHighlightClass =
  'bg-gradient-to-b from-primary-100 via-ink-0to-ink-0outline outline-2 outline-primary-400'
export function ContractsList(props: {
  contracts: Contract[] | undefined
  loadMore?: () => void
  onContractClick?: (contract: Contract) => void
  highlightContractIds?: string[]
  skinny?: boolean
}) {
  const { contracts, loadMore, onContractClick, highlightContractIds, skinny } =
    props
  const onVisibilityUpdated = useCallback(
    (visible: boolean) => {
      if (visible && loadMore) {
        loadMore()
      }
    },
    [loadMore]
  )

  const isMobile = useIsMobile()

  if (contracts === undefined) {
    return <LoadingIndicator />
  }

  return (
    <Col>
      {contracts.map((contract) =>
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
      )}

      {loadMore && (
        <VisibilityObserver
          onVisibilityUpdated={onVisibilityUpdated}
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

export function SimpleContractList(props: {
  contracts: Contract[] | undefined
}) {
  const { contracts } = props

  if (!contracts) return <LoadingIndicator />

  if (contracts.length === 0)
    return <div className="text-ink-500 px-4">None</div>

  return (
    <Col className="bg-canvas-0 divide-ink-300 border-ink-300 w-full divide-y-[0.5px] rounded-sm border-[0.5px]">
      {contracts.map((contract) => (
        <ContractItem key={contract.id} contract={contract} />
      ))}
    </Col>
  )
}

const ContractItem = forwardRef(
  (
    props: {
      contract: Contract
      onContractClick?: (contract: Contract) => void
      className?: string
    },
    ref: React.Ref<HTMLAnchorElement>
  ) => {
    const { onContractClick, className } = props
    const contract = useContract(props.contract.id) ?? props.contract
    const {
      creatorUsername,
      creatorAvatarUrl,
      closeTime,
      isResolved,
      question,
    } = contract

    const isClosed = closeTime && closeTime < Date.now()
    const textColor = isClosed && !isResolved ? 'text-ink-500' : 'text-ink-900'

    return (
      <Link
        onClick={(e) => {
          if (!onContractClick) return
          onContractClick(contract)
          e.preventDefault()
        }}
        ref={ref}
        href={contractPath(contract)}
        className={clsx(
          'group flex flex-col gap-1 whitespace-nowrap px-4 py-3 lg:flex-row lg:gap-2',
          'focus:bg-ink-300/30 lg:hover:bg-ink-300/30 transition-colors',
          className
        )}
      >
        <Avatar
          className="hidden lg:mr-1 lg:flex"
          username={creatorUsername}
          avatarUrl={creatorAvatarUrl}
          size="xs"
        />
        <div
          className={clsx(
            'break-anywhere mr-0.5 whitespace-normal font-medium lg:mr-auto',
            textColor
          )}
        >
          {question}
        </div>
        <Row className="gap-3">
          <Avatar
            className="lg:hidden"
            username={creatorUsername}
            avatarUrl={creatorAvatarUrl}
            size="xs"
          />
          <div className="min-w-[2rem] text-right font-semibold">
            <ContractStatusLabel contract={contract} />
          </div>
        </Row>
      </Link>
    )
  }
)
