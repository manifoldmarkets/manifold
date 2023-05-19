import clsx from 'clsx'
import Masonry from 'react-masonry-css'
import { Contract } from 'web/lib/firebase/contracts'
import { Col } from '../layout/col'
import { ContractCard, ContractMetricsFooter } from './contract-card'
import { ShowTime } from './contract-details'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { LoadMoreUntilNotVisible } from '../widgets/visibility-observer'
import { Group } from 'common/group'
import { groupRoleType } from '../groups/group-member-modal'

export function ContractsGrid(props: {
  contracts: Contract[] | undefined
  loadMore?: () => Promise<boolean>
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
    fromGroupProps,
  } = props
  const { hideQuickBet, hideGroupLink, noLinkAvatar } = cardUIOptions || {}
  if (contracts === undefined) {
    return <LoadingIndicator />
  }

  if (contracts.length === 0) {
    return null // handle empty state outside of component
  }

  return (
    <Col className="gap-8">
      <Masonry
        // Show only 1 column on tailwind's md breakpoint (768px)
        breakpointCols={props.breakpointColumns ?? { default: 2, 768: 1 }}
        className="-ml-4 flex w-auto"
        columnClassName="pl-4 bg-clip-padding"
      >
        {contracts.map((contract) => (
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
              'mb-4 transition-all',
              highlightContractIds?.includes(contract.id) &&
                'via-ink-0to-ink-0bg-gradient-to-b from-primary-50 outline-primary-400 outline outline-2'
            )}
            fromGroupProps={fromGroupProps}
          >
            {contract.mechanism === 'cpmm-1' ? (
              <ContractMetricsFooter contract={contract} />
            ) : undefined}
          </ContractCard>
        ))}
      </Masonry>
      {loadMore && (
        <LoadMoreUntilNotVisible
          loadMore={loadMore}
          className="relative -top-96 h-1"
        />
      )}
    </Col>
  )
}
