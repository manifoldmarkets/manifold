import React from 'react'
import dayjs from 'dayjs'
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
  const { pot, seedAmounts, createdTime } = contract

  const volume = pot.YES + pot.NO - seedAmounts.YES - seedAmounts.NO
  const prob = pot.YES ** 2 / (pot.YES ** 2 + pot.NO ** 2)
  const probPercent = Math.round(prob * 100) + '%'

  return (
    <Col className={className}>
      <Row className="justify-between">
        <Col>
          <div className="text-3xl font-medium p-2">{contract.question}</div>

          <Row className="flex-wrap text-sm text-gray-600">
            <div className="p-2 whitespace-nowrap">
              By {contract.creatorName}
            </div>
            <div className="py-2">•</div>
            <div className="p-2 whitespace-nowrap">
              {dayjs(createdTime).format('MMM D')}
            </div>
            <div className="py-2">•</div>
            <div className="p-2 whitespace-nowrap">
              {formatWithCommas(volume)} volume
            </div>
          </Row>
        </Col>

        <Col className="text-4xl p-2 mx-2 text-primary items-end">
          {probPercent}
          <div className="text-xl">chance</div>
        </Col>
      </Row>

      <Spacer h={4} />

      <ContractProbGraph contract={contract} />

      <Spacer h={12} />

      <div className="text-gray-600 whitespace-pre-line">{contract.description}</div>
    </Col>
  )
}
