import { Contract } from 'common/contract'
import Link from 'next/link'
import Image from 'next/image'
import { memo } from 'react'
import clsx from 'clsx'

import { useEvent } from 'web/hooks/use-event'
import { contractPath } from 'web/lib/firebase/contracts'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { VisibilityObserver } from '../widgets/visibility-observer'
import { Avatar } from '../widgets/avatar'
import { UserLink } from '../widgets/user-link'
import { useIsClient } from 'web/hooks/use-is-client'

export const RelatedContractsList = memo(function RelatedContractsList(props: {
  contracts: Contract[]
  loadMore?: () => Promise<void>
  onContractClick?: (contract: Contract) => void
  className?: string
}) {
  const { contracts, loadMore, onContractClick, className } = props
  const onVisibilityUpdated = useEvent((visible: boolean) => {
    if (visible && loadMore) {
      loadMore()
    }
  })

  if (contracts.length === 0) {
    return null
  }

  return (
    <Col className={clsx(className, 'flex-1')}>
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

      <div className="relative">
        {loadMore && (
          <VisibilityObserver
            onVisibilityUpdated={onVisibilityUpdated}
            className="pointer-events-none absolute bottom-0 h-[75vh] w-full select-none"
          />
        )}
      </div>
      {loadMore && (
        <VisibilityObserver
          onVisibilityUpdated={onVisibilityUpdated}
          className="pointer-events-none w-full flex-1 select-none"
        />
      )}
    </Col>
  )
})

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
