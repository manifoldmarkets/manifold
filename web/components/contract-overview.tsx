import React from 'react'
import { compute, Contract, deleteContract } from '../lib/firebase/contracts'
import { Col } from './layout/col'
import { Spacer } from './layout/spacer'
import { ContractProbGraph } from './contract-prob-graph'
import { ContractDetails } from './contracts-list'
import router from 'next/router'
import { useUser } from '../hooks/use-user'

export const ContractOverview = (props: {
  contract: Contract
  className?: string
}) => {
  const { contract, className } = props
  const { resolution, creatorId, isResolved } = contract
  const { probPercent, volume } = compute(contract)

  const user = useUser()
  const isCreator = user?.id === creatorId

  const resolutionColor =
    resolution === 'YES'
      ? 'text-primary'
      : resolution === 'NO'
      ? 'text-red-400'
      : resolution === 'CANCEL'
      ? 'text-yellow-400'
      : ''
  return (
    <Col className={className}>
      <Col className="justify-between md:flex-row">
        <Col>
          <div className="text-3xl text-indigo-700 mt-2 mb-4">
            {contract.question}
          </div>

          <ContractDetails contract={contract} />
        </Col>

        {resolution ? (
          <Col className="text-4xl mt-4 md:mt-2 md:ml-4 md:mr-6 items-end self-center md:self-start">
            <div className="text-xl text-gray-500">Resolved:</div>
            <div className={resolutionColor}>{resolution}</div>
          </Col>
        ) : (
          <Col className="text-4xl mt-4 md:mt-2 md:ml-4 md:mr-6 text-primary items-end self-center md:self-start">
            {probPercent}
            <div className="text-xl">chance</div>
          </Col>
        )}
      </Col>

      <Spacer h={4} />

      <ContractProbGraph contract={contract} />

      <Spacer h={12} />

      <div className="text-gray-600 whitespace-pre-line">
        {contract.description}
      </div>

      {/* Show a delete button for contracts without any trading */}
      {isCreator && volume === 0 && (
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
    </Col>
  )
}
