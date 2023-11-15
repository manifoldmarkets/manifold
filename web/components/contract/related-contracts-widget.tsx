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

      {contracts.length > 0 && loadMore && (
        <LoadMoreUntilNotVisible loadMore={loadMore} />
      )}
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
      <Col className={clsx(className, 'flex-1 px-3 py-2')}>
        <h2 className={clsx('text-ink-800 mb-2 text-lg')}>Related questions</h2>
        <Carousel loadMore={loadMore}>
          {halfRange.map((i) => {
            const contract = contracts[i * 2]
            const secondContract = contracts[i * 2 + 1]
            return (
              <Col key={contract.id} className="snap-start gap-2">
                <RelatedContractCard
                  className="border-ink-300 min-w-[300px] rounded-xl border-2"
                  contract={contract}
                  onContractClick={onContractClick}
                  twoLines
                />
                {secondContract && (
                  <RelatedContractCard
                    className="border-ink-300 min-w-[300px] rounded-xl border-2"
                    contract={secondContract}
                    onContractClick={onContractClick}
                    twoLines
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
  twoLines?: boolean
  className?: string
}) {
  const { onContractClick, twoLines, className } = props

  const contract =
    useFirebasePublicContract(props.contract.visibility, props.contract.id) ??
    props.contract
  const { creatorUsername, creatorAvatarUrl, question, creatorCreatedTime } =
    contract

  return (
    <Link
      className={clsx(
        'whitespace-nowrap px-4 py-3 outline-none',
        'bg-canvas-0 lg:hover:bg-primary-50 focus:bg-primary-50 transition-colors',
        className
      )}
      href={contractPath(contract)}
      onClick={() => onContractClick?.(contract)}
    >
      <div
        className={clsx(
          'break-anywhere mb-2 whitespace-normal font-medium',
          twoLines ? 'line-clamp-2' : 'line-clamp-3'
        )}
      >
        {question}
      </div>
      <Row className="w-full items-end justify-between">
        <Row className="items-center gap-1.5">
          <Avatar
            username={creatorUsername}
            avatarUrl={creatorAvatarUrl}
            size="xs"
            noLink
          />
          <UserLink
            user={{
              id: contract.creatorId,
              name: contract.creatorName,
              username: contract.creatorUsername,
            }}
            className="text-ink-500 text-sm"
            createdTime={creatorCreatedTime}
            noLink
          />
        </Row>

        <ContractStatusLabel
          contract={contract}
          chanceLabel
          className="font-semibold"
        />
      </Row>
    </Link>
  )
})
