import { Contract } from 'web/lib/firebase/contracts'
import { getTotalContractCreated, User } from 'web/lib/firebase/users'
import { Col } from '../layout/col'
import { SiteLink } from '../widgets/site-link'
import { ContractCard, ContractMetricsFooter } from './contract-card'
import { ShowTime } from './contract-details'
import { ContractSearch } from '../contract-search'
import { useCallback, useEffect, useState } from 'react'
import clsx from 'clsx'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { VisibilityObserver } from '../widgets/visibility-observer'
import Masonry from 'react-masonry-css'
import { Row } from 'web/components/layout/row'

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
  highlightCards?: string[]
  trackingPostfix?: string
  breakpointColumns?: { [key: string]: number }
  showImageOnTopContract?: boolean
}) {
  const {
    contracts,
    showTime,
    loadMore,
    onContractClick,
    cardUIOptions,
    highlightCards,
    trackingPostfix,
    showImageOnTopContract,
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
      <p className="mx-2 text-gray-500">
        No markets found. Why not{' '}
        <SiteLink href="/create" className="font-bold text-gray-700">
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
              highlightCards?.includes(contract.id) &&
                'bg-gradient-to-b from-indigo-50 via-white to-white outline outline-2 outline-indigo-400'
            )}
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

export function CreatorContractsList(props: { creator: User }) {
  const { creator } = props
  const [marketsCreated, setMarketsCreated] = useState<number | undefined>()
  useEffect(() => {
    getTotalContractCreated(creator.id).then(setMarketsCreated)
  }, [creator.id])

  const { creatorTraders } = creator
  const MarketStats = (props: {
    title: string
    total: number
    weeklyChange: number | undefined
  }) => {
    const { title, total, weeklyChange } = props
    return (
      <Col className={clsx('')}>
        <div className="text-xs text-gray-600 sm:text-sm">{title}</div>
        <Row className={'items-center  gap-2'}>
          <span className="text-lg text-indigo-600 sm:text-xl">{total}</span>
          {weeklyChange ? (
            <span
              className={clsx(
                weeklyChange > 0 ? 'text-teal-500' : 'text-scarlet-500'
              )}
            >
              {weeklyChange > 0 ? '+' : ''}
              {Math.round((weeklyChange * 100) / total)}% (7d)
            </span>
          ) : (
            <div />
          )}
        </Row>
      </Col>
    )
  }
  return (
    <Col className={'w-full'}>
      <Row className={'gap-8 pb-4'}>
        <MarketStats
          title={'Total markets'}
          total={marketsCreated ?? 0}
          weeklyChange={undefined}
        />
        <MarketStats
          title={'Unique traders'}
          total={creatorTraders.allTime}
          weeklyChange={creatorTraders.weekly}
        />
      </Row>
      <Row>
        <ContractSearch
          headerClassName="sticky"
          defaultSort="newest"
          defaultFilter="all"
          additionalFilter={{
            creatorId: creator.id,
          }}
          persistPrefix={`user-${creator.id}`}
          profile={true}
        />
      </Row>
    </Col>
  )
}
