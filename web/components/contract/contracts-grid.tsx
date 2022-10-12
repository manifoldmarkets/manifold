import { Contract } from 'web/lib/firebase/contracts'
import { User } from 'web/lib/firebase/users'
import { Col } from '../layout/col'
import { SiteLink } from '../site-link'
import { ContractCard, ContractCardProbChange } from './contract-card'
import { ShowTime } from './contract-details'
import { ContractSearch } from '../contract-search'
import { useCallback } from 'react'
import clsx from 'clsx'
import { LoadingIndicator } from '../loading-indicator'
import { VisibilityObserver } from '../visibility-observer'
import Masonry from 'react-masonry-css'
import { CPMMBinaryContract } from 'common/contract'

export type CardHighlightOptions = {
  itemIds?: string[]
  highlightClassName?: string
}

export function ContractsGrid(props: {
  contracts: Contract[] | undefined
  loadMore?: () => void
  showTime?: ShowTime
  onContractClick?: (contract: Contract) => void
  cardUIOptions?: {
    hideQuickBet?: boolean
    hideGroupLink?: boolean
    noLinkAvatar?: boolean
    showProbChange?: boolean
  }
  highlightOptions?: CardHighlightOptions
  trackingPostfix?: string
  breakpointColumns?: { [key: string]: number }
}) {
  const {
    contracts,
    showTime,
    loadMore,
    onContractClick,
    cardUIOptions,
    highlightOptions,
    trackingPostfix,
  } = props
  const { hideQuickBet, hideGroupLink, noLinkAvatar, showProbChange } =
    cardUIOptions || {}
  const { itemIds: contractIds, highlightClassName } = highlightOptions || {}
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

  if (contracts.length === 0) {
    return (
      <p className="mx-2 text-gray-500">
        No markets found. Why not{' '}
        <SiteLink href="/create" className="font-bold text-gray-700">
          create one?
        </SiteLink>
      </p>
    )
  }

  return (
    <Col className="gap-8">
      <Masonry
        // Show only 1 column on tailwind's md breakpoint (768px)
        breakpointCols={props.breakpointColumns ?? { default: 2, 768: 1 }}
        className="-ml-4 flex w-auto"
        columnClassName="pl-4 bg-clip-padding"
      >
        {contracts.map((contract) =>
          showProbChange && contract.mechanism === 'cpmm-1' ? (
            <ContractCardProbChange
              key={contract.id}
              contract={contract as CPMMBinaryContract}
              showPosition
            />
          ) : (
            <ContractCard
              contract={contract}
              key={contract.id}
              showTime={showTime}
              onClick={
                onContractClick ? () => onContractClick(contract) : undefined
              }
              noLinkAvatar={noLinkAvatar}
              hideQuickBet={hideQuickBet}
              hideGroupLink={hideGroupLink}
              trackingPostfix={trackingPostfix}
              className={clsx(
                'mb-4 break-inside-avoid-column overflow-hidden', // prevent content from wrapping (needs overflow on firefox)
                contractIds?.includes(contract.id) && highlightClassName
              )}
            />
          )
        )}
      </Masonry>
      {loadMore && (
        <VisibilityObserver
          onVisibilityUpdated={onVisibilityUpdated}
          className="relative -top-96 h-1"
        />
      )}
    </Col>
  )
}

export function CreatorContractsList(props: {
  user: User | null | undefined
  creator: User
}) {
  const { user, creator } = props

  return (
    <ContractSearch
      headerClassName="sticky"
      user={user}
      defaultSort="newest"
      defaultFilter="all"
      additionalFilter={{
        creatorId: creator.id,
      }}
      persistPrefix={`user-${creator.id}`}
      profile={true}
    />
  )
}
