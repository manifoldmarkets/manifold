import { Contract } from 'web/lib/firebase/contracts'
import { Col } from '../layout/col'
import { SiteLink } from '../widgets/site-link'
import { ContractCard, ContractMetricsFooter } from './contract-card'
import { ShowTime } from './contract-details'
import { useCallback } from 'react'
import clsx from 'clsx'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { VisibilityObserver } from '../widgets/visibility-observer'
import Masonry from 'react-masonry-css'
import { Group } from 'common/group'
import { groupRoleType } from '../groups/group-member-modal'

export function ContractsGrid(props: {
  contracts: Contract[] | undefined
  loadMore?: () => void
  showTime?: ShowTime
  onContractClick?: (contract: Contract) => void
  cardUIOptions?: {
    hideQuickBet?: boolean
    hideGroupLink?: boolean
    noLinkAvatar?: boolean
  }
  highlightContractIds?: string[]
  trackingPostfix?: string
  breakpointColumns?: { [key: string]: number }
  showImageOnTopContract?: boolean
  trackCardViews?: boolean
  fromGroupProps?: {
    group: Group
    userRole: groupRoleType | null
  }
}) {
  const {
    contracts,
    showTime,
    loadMore,
    onContractClick,
    cardUIOptions,
    highlightContractIds,
    trackingPostfix,
    showImageOnTopContract,
    trackCardViews,
    fromGroupProps,
  } = props
  const { hideQuickBet, hideGroupLink, noLinkAvatar } = cardUIOptions || {}
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
      <p className="text-ink-500 mx-2">
        No markets found. Why not{' '}
        <SiteLink href="/create" className="text-ink-700 font-bold">
          create one?
        </SiteLink>
      </p>
    )
  }

  const lastIndex =
    !!contracts[0].coverImageUrl &&
    contracts.length >= 4 &&
    contracts.length % 2 === 0
      ? contracts.length - 1
      : undefined

  return (
    <Col className="gap-8">
      <Masonry
        // Show only 1 column on tailwind's md breakpoint (768px)
        breakpointCols={props.breakpointColumns ?? { default: 2, 768: 1 }}
        className="-ml-4 flex w-auto"
        columnClassName="pl-4 bg-clip-padding"
      >
        {contracts.map((contract, index) => (
          <ContractCard
            contract={contract}
            key={contract.id}
            showTime={showTime}
            showImage={
              showImageOnTopContract && (index == 0 || index === lastIndex)
            }
            onClick={
              onContractClick ? () => onContractClick(contract) : undefined
            }
            noLinkAvatar={noLinkAvatar}
            hideQuickBet={hideQuickBet}
            hideGroupLink={hideGroupLink}
            trackingPostfix={trackingPostfix}
            className={clsx(
              'mb-4 transition-all',
              highlightContractIds?.includes(contract.id) &&
                'via-ink-0to-ink-0bg-gradient-to-b from-primary-50 outline-primary-400 outline outline-2'
            )}
            trackCardViews={trackCardViews}
            fromGroupProps={fromGroupProps}
          >
            {contract.mechanism === 'cpmm-1' ? (
              <ContractMetricsFooter contract={contract} />
            ) : undefined}
          </ContractCard>
        ))}
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
