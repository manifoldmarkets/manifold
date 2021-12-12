import React from 'react'
import { Contract } from '../lib/firebase/contracts'
import { Col } from './layout/col'
import { Row } from './layout/row'
import { Spacer } from './layout/spacer'
import { formatWithCommas } from '../lib/util/format'
import { ContractProbGraph } from './contract-prob-graph'

export const ContractOverview = (props: {
  contract: Contract
  className?: string
}) => {
  const { contract, className } = props
  const { pot, seedAmounts } = contract

  const volume = pot.YES + pot.NO - seedAmounts.YES - seedAmounts.NO

  return (
    <Col className={className}>
      <div className="text-3xl font-medium p-2">{contract.question}</div>

      <Row className="flex-wrap text-sm text-gray-600">
        <div className="p-2 whitespace-nowrap">By {contract.creatorName}</div>
        <div className="py-2">•</div>
        <div className="p-2 whitespace-nowrap">Dec 9</div>
        <div className="py-2">•</div>
        <div className="p-2 whitespace-nowrap">
          {formatWithCommas(volume)} volume
        </div>
      </Row>

      <Spacer h={4} />

      <ContractProbGraph contract={contract} />

      <Spacer h={12} />

      <div className="text-gray-600">{contract.description}</div>
    </Col>
  )
}
