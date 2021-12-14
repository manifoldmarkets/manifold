import Link from 'next/link'
import React, { useEffect, useState } from 'react'
import { Header } from '../components/header'
import { Col } from '../components/layout/col'
import { Row } from '../components/layout/row'
import { Title } from '../components/title'
import { compute, listAllContracts } from '../lib/firebase/contracts'
import { Contract } from '../lib/firebase/contracts'
import { formatWithCommas } from '../lib/util/format'

export function ContractDetails(props: { contract: Contract }) {
  const { contract } = props
  const { volume, createdDate } = compute(contract)

  return (
    <Row className="flex-wrap text-sm text-gray-500">
      <div className="whitespace-nowrap">By {contract.creatorName}</div>
      <div className="mx-2">•</div>
      <div className="whitespace-nowrap">{createdDate}</div>
      <div className="mx-2">•</div>
      <div className="whitespace-nowrap">{formatWithCommas(volume)} vol</div>
    </Row>
  )
}

function ContractCard(props: { contract: Contract }) {
  const { contract } = props
  const { probPercent } = compute(contract)

  return (
    <Link href={`/contract/${contract.id}`}>
      <a>
        <li className="col-span-1 bg-white hover:bg-gray-100 shadow-xl rounded-lg divide-y divide-gray-200">
          <div className="card">
            <div className="card-body p-6">
              <div className="flex justify-between gap-2">
                {/* Left side of card */}
                <div>
                  <p className="font-medium text-indigo-700 mb-8">
                    {contract.question}
                  </p>
                  <ContractDetails contract={contract} />
                </div>

                {/* Right side of card */}
                <Col>
                  <Col className="text-4xl mx-auto items-end">
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

export function ContractsGrid(props: { contracts: Contract[] }) {
  const { contracts } = props
  return (
    <ul
      role="list"
      className="grid grid-cols-1 gap-6 sm:grid-cols-1 lg:grid-cols-2"
    >
      {contracts.map((contract) => (
        <ContractCard contract={contract} key={contract.id} />
      ))}
      {/* TODO: Show placeholder if empty */}
    </ul>
  )
}

export default function Markets() {
  const [contracts, setContracts] = useState<Contract[]>([])
  useEffect(() => {
    listAllContracts().then(setContracts)
  }, [])

  const [query, setQuery] = useState('')
  type Sort = 'createdTime' | 'volume'
  const [sort, setSort] = useState('volume')

  function check(corpus: String) {
    return corpus.toLowerCase().includes(query.toLowerCase())
  }
  const matches = contracts.filter(
    (c) => check(c.question) || check(c.description) || check(c.creatorName)
  )

  function volume(contract: Contract) {
    return (
      contract.pot.YES +
      contract.pot.NO -
      contract.seedAmounts.YES -
      contract.seedAmounts.NO
    )
  }

  if (sort === 'createdTime') {
    matches.sort((a, b) => b.createdTime - a.createdTime)
  } else if (sort === 'volume') {
    matches.sort((a, b) => volume(b) - volume(a))
  }

  return (
    <div>
      <Header />
      <div className="max-w-4xl py-8 mx-auto">
        {/* Show a search input next to a sort dropdown */}
        <div className="flex justify-between gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search markets"
            className="input input-bordered w-full"
          />
          <select
            className="select select-bordered"
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
          >
            <option value="volume">Most traded</option>
            <option value="createdTime">Newest first</option>
          </select>
        </div>

        <Title text="Open markets" className="mt-16" />
        <ContractsGrid contracts={matches.filter((c) => !c.resolution)} />

        <Title text="Resolved markets" className="mt-16" />
        <ContractsGrid contracts={matches.filter((c) => c.resolution)} />
      </div>
    </div>
  )
}
