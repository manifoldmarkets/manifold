import clsx from 'clsx'
import Link from 'next/link'
import { memo, useState } from 'react'

import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Avatar } from '../widgets/avatar'
import { UserLink } from '../widgets/user-link'
import { LoadMoreUntilNotVisible } from '../widgets/visibility-observer'
import { ContractStatusLabel } from './contracts-table'
import { useFirebasePublicContract } from 'web/hooks/use-contract-supabase'
import { Contract, contractPath, CPMMBinaryContract } from 'common/contract'
import Masonry from 'react-masonry-css'
import { Button } from 'web/components/buttons/button'
import { track } from 'web/lib/service/analytics'
import {
  ArrowRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/outline'
import { Topic, TOPIC_KEY } from 'common/group'
import { FeedBinaryChart } from 'web/components/feed/feed-chart'
import { DAY_MS } from 'common/util/time'
import { linkClass } from 'web/components/widgets/site-link'
import { removeEmojis } from 'common/topics'

export const RelatedContractsList = memo(function (props: {
  contracts: Contract[]
  loadMore?: () => Promise<boolean>
  topics?: Topic[]
  contractsByTopicSlug?: Record<string, Contract[]>
  seenContractIds?: string[]
  className?: string
}) {
  const {
    contracts,
    loadMore,
    seenContractIds,
    contractsByTopicSlug,
    topics,
    className,
  } = props
  const MAX_CONTRACTS_PER_GROUP = 2
  const displayedGroupContractIds = Object.values(contractsByTopicSlug ?? {})
    .map((contracts) =>
      contracts.slice(0, MAX_CONTRACTS_PER_GROUP).map((c) => c.id)
    )
    .flat()

  return (
    <Col className={clsx(className, 'flex-1')}>
      {topics &&
        contractsByTopicSlug &&
        topics
          .filter(
            (t) =>
              getUnseenContracts(contractsByTopicSlug[t.slug], seenContractIds)
                .length > 0
          )
          .map((topic) => (
            <Col key={'related-topics-' + topic.id} className={'my-2'}>
              <h2 className={clsx('text-ink-600 mb-2 text-lg')}>
                <Link
                  className={linkClass}
                  href={`/browse?${TOPIC_KEY}=${topic.slug}`}
                >
                  <Row className={'items-center gap-1'}>
                    {removeEmojis(topic.name)} questions
                    <ArrowRightIcon className="h-4 w-4" />
                  </Row>
                </Link>
              </h2>
              <Col className="divide-ink-300 divide-y-[0.5px]">
                {getUnseenContracts(
                  contractsByTopicSlug[topic.slug],
                  seenContractIds
                )
                  .slice(0, MAX_CONTRACTS_PER_GROUP)
                  .map((contract) => (
                    <SidebarRelatedContractCard
                      key={contract.id}
                      contract={contract}
                      onContractClick={(c) =>
                        track('click related market', { contractId: c.id })
                      }
                      twoLines
                    />
                  ))}
              </Col>
            </Col>
          ))}
      <h2 className={clsx('text-ink-600 mb-2 text-xl')}>Related questions</h2>
      <Col className="divide-ink-300 divide-y-[0.5px]">
        {getUnseenContracts(contracts, seenContractIds)
          .filter((c) => !displayedGroupContractIds.includes(c.id))
          .map((contract) => (
            <SidebarRelatedContractCard
              contract={contract}
              key={contract.id}
              onContractClick={(c) =>
                track('click related market', { contractId: c.id })
              }
            />
          ))}
      </Col>

      {contracts.length > 0 && loadMore && (
        <LoadMoreUntilNotVisible loadMore={loadMore} />
      )}
    </Col>
  )
})

const SidebarRelatedContractCard = memo(function (props: {
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
        'px-4 py-3',
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

const RelatedContractCard = memo(function (props: {
  contract: Contract
  onContractClick?: (contract: Contract) => void
  twoLines?: boolean
  showGraph?: boolean
  className?: string
}) {
  const { onContractClick, showGraph, twoLines, className } = props

  const contract =
    useFirebasePublicContract(props.contract.visibility, props.contract.id) ??
    props.contract
  const { creatorUsername, creatorAvatarUrl, question, creatorCreatedTime } =
    contract
  const probChange =
    contract.outcomeType === 'BINARY' &&
    showGraph &&
    Math.abs((contract as CPMMBinaryContract).probChanges.day) > 0.03
      ? (contract as CPMMBinaryContract).probChanges.day
      : 0

  return (
    <Link
      className={clsx(
        'whitespace-nowrap outline-none',
        'bg-canvas-0 lg:hover:bg-primary-50 focus:bg-primary-50 transition-colors',
        'border-ink-300 my-2 flex flex-col rounded-lg border-2 p-2',
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

        <Row className={'items-baseline gap-1'}>
          {contract.outcomeType === 'BINARY' && probChange !== 0 && (
            <span
              className={clsx(
                'mr-1 text-sm',
                probChange > 0 ? 'text-green-500' : 'text-red-500'
              )}
            >
              {probChange > 0 ? '+' : ''}
              {Math.round(probChange * 100)}% 1d
            </span>
          )}
          <ContractStatusLabel contract={contract} className="font-semibold" />
          <span className={'text-ink-500 text-sm'}>chance</span>
        </Row>
      </Row>
      {contract.outcomeType === 'BINARY' && probChange !== 0 && (
        <FeedBinaryChart
          contract={contract}
          className="my-4"
          startDate={Date.now() - DAY_MS}
          addLeadingBetPoint={true}
        />
      )}
    </Link>
  )
})

const getUnseenContracts = (
  contracts: Contract[] | undefined,
  seenContractIds?: string[]
) =>
  contracts ? contracts.filter((c) => !seenContractIds?.includes(c.id)) : []

export const RelatedContractsGrid = memo(function (props: {
  contracts: Contract[]
  contractsByTopicSlug?: Record<string, Contract[]>
  topics?: Topic[]
  seenContractIds?: string[]
  loadMore?: () => Promise<boolean>
  className?: string
  showAll?: boolean
}) {
  const {
    contracts,
    topics,
    contractsByTopicSlug,
    loadMore,
    className,
    showAll,
    seenContractIds,
  } = props
  const [showMore, setShowMore] = useState(showAll ?? false)
  const hasRelatedContractByTopic =
    Object.values(contractsByTopicSlug ?? {}).length > 0
  if (contracts.length === 0 && !hasRelatedContractByTopic) {
    return null
  }
  const MAX_CONTRACTS_PER_GROUP = 4
  const displayedGroupContractIds = Object.values(contractsByTopicSlug ?? {})
    .map((contracts) =>
      contracts.slice(0, MAX_CONTRACTS_PER_GROUP).map((c) => c.id)
    )
    .flat()
  return (
    <Col className={clsx(className, 'mb-2 mt-4 flex-1 py-2 xl:hidden')}>
      {topics &&
        contractsByTopicSlug &&
        topics
          .filter(
            (t) =>
              getUnseenContracts(contractsByTopicSlug[t.slug], seenContractIds)
                .length > 0
          )
          .map((topic) => (
            <Col key={'related-topics-' + topic.id} className={'my-2'}>
              <h2 className={clsx('text-ink-800 mb-1 text-lg')}>
                <Link
                  className={linkClass}
                  href={`/browse?${TOPIC_KEY}=${topic.slug}`}
                >
                  Related in {removeEmojis(topic.name)}
                </Link>
              </h2>
              <Masonry
                breakpointCols={{ default: 2, 768: 1 }}
                className={clsx(
                  ' flex w-auto',
                  'scrollbar-hide snap-x gap-2 overflow-y-auto scroll-smooth',
                  'h-full'
                )}
              >
                {getUnseenContracts(
                  contractsByTopicSlug[topic.slug],
                  seenContractIds
                )
                  .slice(0, MAX_CONTRACTS_PER_GROUP)
                  .map((contract) => (
                    <RelatedContractCard
                      key={contract.id}
                      showGraph={showAll}
                      contract={contract}
                      onContractClick={(c) =>
                        track('click related market', { contractId: c.id })
                      }
                      twoLines
                    />
                  ))}
              </Masonry>

              <Row className={'text-ink-700 items-center justify-end'}>
                <Link
                  className={linkClass}
                  href={`/browse?${TOPIC_KEY}=${topic.slug}`}
                >
                  <Row className={'items-center gap-1'}>
                    See more {removeEmojis(topic.name)} questions
                    <ArrowRightIcon className="h-4 w-4" />
                  </Row>
                </Link>
              </Row>
            </Col>
          ))}
      <h2 className={clsx('text-ink-800 mb-2 text-lg')}>
        {hasRelatedContractByTopic ? 'More related ' : 'Related '} questions
      </h2>
      <Masonry
        breakpointCols={{ default: 2, 768: 1 }}
        className={clsx(
          ' flex w-auto',
          'scrollbar-hide snap-x gap-2 overflow-y-auto scroll-smooth',
          showAll ? 'h-full' : showMore ? 'h-[40rem]' : 'h-48'
        )}
      >
        {getUnseenContracts(contracts, seenContractIds)
          .filter((c) => !displayedGroupContractIds.includes(c.id))
          .map((contract) => (
            <RelatedContractCard
              key={contract.id}
              showGraph={showAll}
              contract={contract}
              onContractClick={(c) =>
                track('click related market', { contractId: c.id })
              }
              twoLines
            />
          ))}
      </Masonry>
      {loadMore && showAll && <LoadMoreUntilNotVisible loadMore={loadMore} />}
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
