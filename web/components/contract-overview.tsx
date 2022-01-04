import { compute, Contract, deleteContract } from '../lib/firebase/contracts'
import { Col } from './layout/col'
import { Spacer } from './layout/spacer'
import { ContractProbGraph } from './contract-prob-graph'
import router from 'next/router'
import { useUser } from '../hooks/use-user'
import { Row } from './layout/row'
import dayjs from 'dayjs'
import { Linkify } from './linkify'
import clsx from 'clsx'
import { ContractDetails, ResolutionOrChance } from './contract-card'
import { ContractFeed } from './contract-feed'

function ContractCloseTime(props: { contract: Contract }) {
  const closeTime = props.contract.closeTime
  if (!closeTime) {
    return null
  }
  return (
    <div className="text-gray-500 text-sm">
      Trading {closeTime > Date.now() ? 'closes' : 'closed'} at{' '}
      {dayjs(closeTime).format('MMM D, h:mma')}
    </div>
  )
}

export const ContractOverview = (props: {
  contract: Contract
  className?: string
}) => {
  const { contract, className } = props
  const { resolution, creatorId } = contract
  const { probPercent, truePool } = compute(contract)

  const user = useUser()
  const isCreator = user?.id === creatorId

  return (
    <Col className={clsx('mb-6', className)}>
      <Row className="justify-between gap-4">
        <Col className="gap-4">
          <div className="text-2xl md:text-3xl text-indigo-700">
            <Linkify text={contract.question} />
          </div>

          <ResolutionOrChance
            className="md:hidden"
            resolution={resolution}
            probPercent={probPercent}
            large
          />

          <ContractDetails contract={contract} />
        </Col>

        <ResolutionOrChance
          className="hidden md:flex md:items-end"
          resolution={resolution}
          probPercent={probPercent}
          large
        />
      </Row>

      <Spacer h={4} />

      <ContractProbGraph contract={contract} />

      <Spacer h={12} />

      {/* Show a delete button for contracts without any trading */}
      {isCreator && truePool === 0 && (
        <>
          <Spacer h={8} />
          <button
            className="btn btn-xs btn-error btn-outline mt-1 max-w-fit self-end"
            onClick={async (e) => {
              e.preventDefault()
              await deleteContract(contract.id)
              router.push('/markets')
            }}
          >
            Delete
          </button>
        </>
      )}

      <ContractFeed contract={contract} />

      <Spacer h={4} />

      <ContractCloseTime contract={contract} />
    </Col>
  )
}
