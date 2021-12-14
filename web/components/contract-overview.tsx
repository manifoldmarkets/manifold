import React from 'react'
import { compute, Contract } from '../lib/firebase/contracts'
import { Col } from './layout/col'
import { Spacer } from './layout/spacer'
import { ContractProbGraph } from './contract-prob-graph'
import { ContractDetails } from '../pages/markets'

export const ContractOverview = (props: {
  contract: Contract
  className?: string
}) => {
  const { contract, className } = props
  const { probPercent } = compute(contract)

  return (
    <Col className={className}>
      <Col className="justify-between md:flex-row">
        <Col>
          <div className="text-3xl text-indigo-700 mt-2 mb-4">
            {contract.question}
          </div>

          <ContractDetails contract={contract} />
        </Col>

        <Col className="text-4xl mt-4 md:mt-2 md:ml-4 md:mr-6 text-primary items-end self-center md:self-start">
          {probPercent}
          <div className="text-xl">chance</div>
        </Col>
      </Col>

      <Spacer h={4} />

      <ContractProbGraph contract={contract} />

      <Spacer h={12} />

      <div className="text-gray-600 whitespace-pre-line">
        {contract.description}
      </div>
    </Col>
  )
}
