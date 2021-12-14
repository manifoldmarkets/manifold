import dayjs from 'dayjs'
import Link from 'next/link'
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
    <Link href={`/contract/${contract.id}`}>
      <a>
        <li className="col-span-1 bg-white hover:bg-gray-100 rounded-lg shadow divide-y divide-gray-200">
          <div className="card">
            <div className="card-body p-6">
              <div className="flex justify-between gap-2">
                {/* Left side of card */}
                <div>
                  <p className="font-medium text-indigo-700">
                    {contract.question}
                  </p>
                  <Spacer h={8} />
                  {/* Copied from contract-overview.tsx */}
                  <Row className="flex-wrap text-sm text-gray-500">
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
                  <Col className="text-4xl mx-auto  items-end">
                    {contract.resolution || (
                      <div className="text-primary">
                        {probPercent}
                        <div className="text-lg">chance</div>
                      </div>
                    )}
                  </Col>
                </Col>
              </div>
            </div>
          </div>
        </li>
      </a>
    </Link>
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
        <Title text="Open markets" />
        <ul
          role="list"
          className="grid grid-cols-1 gap-6 sm:grid-cols-1 lg:grid-cols-2"
        >
          {contracts
            .filter((c) => !c.resolution)
            .map((contract) => (
              <ContractCard contract={contract} key={contract.id} />
            ))}
        </ul>

        <Title text="Resolved markets" className="mt-20" />
        <ul
          role="list"
          className="grid grid-cols-1 gap-6 sm:grid-cols-1 lg:grid-cols-2"
        >
          {contracts
            .filter((c) => c.resolution)
            .map((contract) => (
              <ContractCard contract={contract} key={contract.id} />
            ))}
        </ul>
      </div>
    </div>
  )
}
