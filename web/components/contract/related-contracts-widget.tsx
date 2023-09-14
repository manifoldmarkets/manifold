import clsx from 'clsx'
import Link from 'next/link'
import { memo } from 'react'
import { range } from 'lodash'

import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Avatar } from '../widgets/avatar'
import { UserLink } from '../widgets/user-link'
import { LoadMoreUntilNotVisible } from '../widgets/visibility-observer'
import { ContractStatusLabel } from './contracts-table'
import { useFirebasePublicContract } from 'web/hooks/use-contract-supabase'
import { Contract, contractPath } from 'common/contract'
import { Carousel } from '../widgets/carousel'

export const RelatedContractsList = memo(function RelatedContractsList(props: {
  contracts: Contract[]
  loadMore?: () => Promise<boolean>
  onContractClick?: (contract: Contract) => void
  className?: string
}) {
  const { contracts, loadMore, onContractClick, className } = props
  if (contracts.length === 0) {
    return null
  }

  return (
    <Col className={clsx(className, 'flex-1')}>
      <h2 className={clsx('text-ink-600 mb-2 text-xl')}>Related questions</h2>
      <Col className="divide-ink-300 divide-y-[0.5px]">
        {contracts.map((contract) => (
          <RelatedContractCard
            contract={contract}
            key={contract.id}
            onContractClick={onContractClick}
          />
        ))}
      </Col>

      {loadMore && <LoadMoreUntilNotVisible loadMore={loadMore} />}
    </Col>
  )
})

export const RelatedContractsCarousel = memo(
  function RelatedContractsCarousel(props: {
    contracts: Contract[]
    loadMore?: () => Promise<boolean>
    onContractClick?: (contract: Contract) => void
    className?: string
  }) {
    const { contracts, loadMore, onContractClick, className } = props
    if (contracts.length === 0) {
      return null
    }

    const halfRange = range(Math.floor(contracts.length / 2))

    return (
      <Col className={clsx(className, 'flex-1')}>
        <h2 className={clsx('text-ink-600 mb-2 text-lg')}>Related questions</h2>
        <Carousel loadMore={loadMore}>
          {halfRange.map((i) => {
            const contract = contracts[i * 2]
            const secondContract = contracts[i * 2 + 1]
            return (
              <Col key={contract.id} className="snap-center">
                <RelatedContractCard
                  className="min-w-[300px]"
                  contract={contract}
                  onContractClick={onContractClick}
                />
                {secondContract && (
                  <RelatedContractCard
                    className="min-w-[300px]"
                    contract={secondContract}
                    onContractClick={onContractClick}
                  />
                )}
              </Col>
            )
          })}
        </Carousel>
      </Col>
    )
  }
)

const RelatedContractCard = memo(function RelatedContractCard(props: {
  contract: Contract
  onContractClick?: (contract: Contract) => void
  className?: string
}) {
  const { onContractClick, className } = props

  const contract =
    useFirebasePublicContract(props.contract.visibility, props.contract.id) ??
    props.contract
  const { creatorUsername, creatorAvatarUrl, question, creatorCreatedTime } =
    contract

  return (
    <Col
      className={clsx(
        'group relative gap-2 whitespace-nowrap rounded-sm py-3 px-4',
        'bg-canvas-0 focus:bg-ink-300/30 lg:hover:bg-ink-300/30 transition-colors',
        className
      )}
    >
      <Link
        href={contractPath(contract)}
        className="absolute top-0 left-0 h-full w-full"
        onClick={() => onContractClick?.(contract)}
      />
      <div>
        <span
          className={clsx(
            'break-anywhere line-clamp-3 whitespace-normal font-medium'
          )}
        >
          {question}
        </span>
      </div>
      <Row className="z-10 gap-2">
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
        />

        <div className="ml-auto font-semibold">
          <ContractStatusLabel contract={contract} chanceLabel />
        </div>
      </Row>
    </Col>
  )
})
