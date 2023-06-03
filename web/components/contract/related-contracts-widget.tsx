import clsx from 'clsx'
import { Contract, contractPath } from 'common/contract'
import Link from 'next/link'
import { memo } from 'react'

import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Avatar } from '../widgets/avatar'
import { UserLink } from '../widgets/user-link'
import { LoadMoreUntilNotVisible } from '../widgets/visibility-observer'
import { ContractStatusLabel } from './contracts-table'
import { useFirebasePublicAndRealtimePrivateContract } from 'web/hooks/use-contract-supabase'

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
      <h2 className={clsx('text-ink-600 mb-2 text-xl')}>Related markets</h2>
      <Col className="divide-ink-300 divide-y-[0.5px]">
        {contracts.map((contract) => (
          <RelatedContractCard
            contract={contract}
            key={contract.id}
            onContractClick={onContractClick}
          />
        ))}
      </Col>

      <div className="relative">
        {loadMore && (
          <LoadMoreUntilNotVisible
            className="pointer-events-none absolute bottom-0 h-[75vh] w-full select-none"
            loadMore={loadMore}
          />
        )}
      </div>
    </Col>
  )
})

const RelatedContractCard = memo(function RelatedContractCard(props: {
  contract: Contract
  onContractClick?: (contract: Contract) => void
}) {
  const { onContractClick } = props

  const contract =
    useFirebasePublicAndRealtimePrivateContract(
      props.contract.visibility,
      props.contract.id
    ) ?? props.contract
  const { creatorUsername, creatorAvatarUrl, question, creatorCreatedTime } =
    contract

  return (
    <Col
      className={clsx(
        'group relative gap-2 whitespace-nowrap rounded-sm py-3 px-4',
        'bg-canvas-0 focus:bg-ink-300/30 lg:hover:bg-ink-300/30 transition-colors'
      )}
    >
      <Link
        href={contractPath(contract)}
        className="absolute top-0 left-0 h-full w-full"
        onClick={() => onContractClick?.(contract)}
      />
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
      </Row>
      <div>
        <span className={clsx('break-anywhere whitespace-normal font-medium')}>
          {question}
        </span>
        <span className="float-right ml-2 font-semibold">
          <ContractStatusLabel contract={contract} />
        </span>
      </div>
    </Col>
  )
})
