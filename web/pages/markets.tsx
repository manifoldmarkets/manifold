import dayjs from 'dayjs'
import React, { useEffect, useState } from 'react'
import { Header } from '../components/header'
import { Col } from '../components/layout/col'
import { Row } from '../components/layout/row'
import { Spacer } from '../components/layout/spacer'
import { Title } from '../components/title'
import { listAllContracts } from '../lib/firebase/contracts'
import { Contract } from '../lib/firebase/contracts'
import { formatWithCommas } from '../lib/util/format'

function ContractCard(props: { contract: Contract }) {
  const { contract } = props

  // Copied from contract-overview.tsx
  const { pot, seedAmounts, createdTime } = contract
  const volume = pot.YES + pot.NO - seedAmounts.YES - seedAmounts.NO
  const prob = pot.YES ** 2 / (pot.YES ** 2 + pot.NO ** 2)
  const probPercent = Math.round(prob * 100) + '%'

  return (
    <li className="col-span-1 bg-white hover:bg-gray-100 rounded-lg shadow divide-y divide-gray-200">
      <div className="card">
        <div className="card-body p-6">
          <div className="flex justify-between gap-2">
            {/* Left side of card */}
            <div>
              <p className="font-medium text-indigo-700">{contract.question}</p>
              <Spacer h={8} />
              {/* Copied from contract-overview.tsx */}
              <Row className="flex-wrap text-sm text-gray-600">
                <div className="whitespace-nowrap">
                  By {contract.creatorName}
                </div>
                <div className="mx-2">•</div>
                <div className="whitespace-nowrap">
                  {dayjs(createdTime).format('MMM D')}
                </div>
                <div className="mx-2">•</div>
                <div className="whitespace-nowrap">
                  {formatWithCommas(volume)} vol
                </div>
              </Row>
            </div>
            {/* Right side of card */}
            <Col>
              <Col className="text-4xl mb-2 mx-auto text-primary items-end">
                {probPercent}
              </Col>
              {/* Show a yes and a no button side-by-side */}
              <div className="flex items-center text-xs gap-1">
                <button className="bg-primary text-white font-medium px-4 py-2 rounded-lg">
                  YES
                </button>
                <button className="bg-gray-200 text-gray-600 font-medium px-4 py-2 rounded-lg">
                  NO
                </button>
              </div>
            </Col>
          </div>
        </div>
      </div>
    </li>
  )
}

export default function Markets() {
  const [contracts, setContracts] = useState<Contract[]>([])
  useEffect(() => {
    listAllContracts().then(setContracts)
  }, [])

  return (
    <div>
      <Header />
      <div className="max-w-4xl py-8 mx-auto">
        <Title text="Newest markets" />
        <ul
          role="list"
          className="grid grid-cols-1 gap-6 sm:grid-cols-1 lg:grid-cols-2"
        >
          {contracts.map((contract) => (
            <ContractCard contract={contract} key={contract.id} />
          ))}
        </ul>
      </div>
    </div>
  )
}
