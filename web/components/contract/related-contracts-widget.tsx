import { Contract } from 'common/contract'
import Link from 'next/link'
import Image from 'next/image'
import { memo } from 'react'
import clsx from 'clsx'

import { useEvent } from 'web/hooks/use-event'
import { useRelatedMarkets } from 'web/hooks/use-related-contracts'
import { contractPath } from 'web/lib/firebase/contracts'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { VisibilityObserver } from '../widgets/visibility-observer'
import { Avatar } from '../widgets/avatar'
import { UserLink } from '../widgets/user-link'
import { useIsClient } from 'web/hooks/use-is-client'

export const RelatedContractsWidget = memo(
  function RecommendedContractsWidget(props: {
    contract: Contract
    initialContracts: Contract[]
    onContractClick?: (contract: Contract) => void
    className?: string
  }) {
    const { contract, initialContracts, onContractClick, className } = props
    const { contracts: relatedMarkets, loadMore } = useRelatedMarkets(
      contract,
      initialContracts
    )

    if (relatedMarkets.length === 0) {
      return null
    }
    return (
      <Col className={clsx(className, 'gap-2')}>
        <RelatedContractsList
          contracts={relatedMarkets}
          onContractClick={onContractClick}
          loadMore={loadMore}
        />
      </Col>
    )
  }
)

function RelatedContractsList(props: {
  contracts: Contract[] | undefined
  loadMore?: () => void
  onContractClick?: (contract: Contract) => void
}) {
  const { contracts, loadMore, onContractClick } = props
  const onVisibilityUpdated = useEvent((visible: boolean) => {
    if (visible && loadMore) {
      loadMore()
    }
  })

  if (contracts === undefined) {
    return <LoadingIndicator />
  }

  return (
    <Col>
      <Col className="divide-ink-300 divide-y-[0.5px]">
        {contracts
          .filter((c) => c.coverImageUrl)
          .map((contract) => (
            <RelatedContractCard
              contract={contract}
              key={contract.id}
              onContractClick={onContractClick}
            />
          ))}
      </Col>

      {loadMore && (
        <VisibilityObserver
          onVisibilityUpdated={onVisibilityUpdated}
          className="relative -top-96 h-1"
        />
      )}
    </Col>
  )
}

const RelatedContractCard = memo(function RelatedContractCard(props: {
  contract: Contract
  onContractClick?: (contract: Contract) => void
}) {
  const { contract, onContractClick } = props
  const {
    creatorUsername,
    creatorAvatarUrl,
    coverImageUrl,
    question,
    creatorCreatedTime,
  } = contract

  const isClient = useIsClient()

  return (
    <Link
      href={contractPath(contract)}
      className={clsx(
        'group flex flex-col gap-2 whitespace-nowrap rounded-sm py-3 px-4',
        'bg-canvas-0 focus:bg-ink-300/30 lg:hover:bg-ink-300/30 transition-colors'
      )}
      onClick={() => onContractClick?.(contract)}
    >
      <Row className="gap-2">
        <Avatar
          username={creatorUsername}
          avatarUrl={creatorAvatarUrl}
          size="xs"
        />
        <UserLink
          name={contract.creatorName}
          username={contract.creatorUsername}
          className="text-ink-400 text-sm"
          createdTime={creatorCreatedTime}
          noLink={!isClient}
        />
      </Row>
      <Row className="gap-2">
        <div className={clsx('break-anywhere whitespace-normal font-medium')}>
          {question}
        </div>
      </Row>

      {coverImageUrl && (
        <div className="relative h-32">
          <Image
            fill
            alt={question}
            sizes="100vw"
            className="object-cover opacity-90"
            src={coverImageUrl ?? ''}
          />
        </div>
      )}
    </Link>
  )
})
