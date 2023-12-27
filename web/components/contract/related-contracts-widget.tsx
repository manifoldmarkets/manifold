import clsx from 'clsx'
import Link from 'next/link'
import { memo, useState } from 'react'
import { range } from 'lodash'

import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Avatar } from '../widgets/avatar'
import { UserLink } from '../widgets/user-link'
import { LoadMoreUntilNotVisible } from '../widgets/visibility-observer'
import { ContractStatusLabel } from './contracts-table'
import { useFirebasePublicContract } from 'web/hooks/use-contract-supabase'
import { Contract, contractPath } from 'common/contract'
import Masonry from 'react-masonry-css'
import { Button } from 'web/components/buttons/button'
import { track } from 'web/lib/service/analytics'
import { Carousel } from 'web/components/widgets/carousel'
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/outline'

export const RelatedContractsList = memo(function (props: {
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
            className={'px-4 py-3'}
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

export const RelatedContractsCarousel = memo(function (props: {
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
    <Col
      className={clsx(className, '-ml-4 mb-2 mt-4 flex-1 px-3 py-2 xl:hidden')}
    >
      <h2 className={clsx('text-ink-800 mb-2 text-lg')}>Related questions</h2>
      <Carousel loadMore={loadMore}>
        {halfRange.map((i) => {
          const contract = contracts[i * 2]
          const secondContract = contracts[i * 2 + 1]
          return (
            <Col key={contract.id} className="snap-start gap-2">
              <RelatedContractCard
                className="border-ink-300 min-w-[300px] rounded-xl border-2 px-4 py-3"
                contract={contract}
                onContractClick={onContractClick}
                twoLines
              />
              {secondContract && (
                <RelatedContractCard
                  className="border-ink-300 min-w-[300px] rounded-xl border-2 px-4 py-3"
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
})

const RelatedContractCard = memo(function (props: {
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
        'whitespace-nowrap outline-none',
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

export const RelatedContractsGrid = memo(function (props: {
  contracts: Contract[]
  loadMore?: () => Promise<boolean>
  className?: string
  showAll?: boolean
}) {
  const { contracts, loadMore, className, showAll } = props
  const [showMore, setShowMore] = useState(showAll ?? false)
  if (contracts.length === 0) {
    return null
  }

  return (
    <Col className={clsx(className, 'mb-2 mt-4 flex-1 py-2 xl:hidden')}>
      <h2 className={clsx('text-ink-800 mb-2 text-lg')}>Related questions</h2>
      <Masonry
        breakpointCols={{ default: 2, 768: 1 }}
        className={clsx(
          ' flex w-auto',
          'scrollbar-hide snap-x gap-2 overflow-y-auto scroll-smooth',
          showAll ? 'h-full' : showMore ? 'h-[40rem]' : 'h-48'
        )}
      >
        {contracts.map((contract) => (
          <RelatedContractCard
            key={contract.id}
            className={
              'border-ink-300 my-2 flex flex-col rounded-lg border-2 p-2'
            }
            contract={contract}
            onContractClick={(c) =>
              track('click related market', { contractId: c.id })
            }
            twoLines
          />
        ))}
        {loadMore && <LoadMoreUntilNotVisible loadMore={loadMore} />}
      </Masonry>
      {!showAll && (
        <Button
          color={'gray-white'}
          onClick={() => setShowMore(!showMore)}
          className="mt-2"
        >
          <Row className={'items-center'}>
            {showMore ? (
              <ChevronUpIcon className="mr-1 h-4 w-4" />
            ) : (
              <ChevronDownIcon className="mr-1 h-4 w-4" />
            )}
            {showMore ? 'Show less' : 'Show more'}
          </Row>
        </Button>
      )}
    </Col>
  )
})
