import _ from 'lodash'
import Link from 'next/link'
import clsx from 'clsx'
import { useEffect, useState } from 'react'

import { Row } from '../components/layout/row'
import {
  compute,
  Contract,
  listContracts,
  path,
} from '../lib/firebase/contracts'
import { formatMoney } from '../lib/util/format'
import { User } from '../lib/firebase/users'
import { UserLink } from './user-page'

export function ContractDetails(props: { contract: Contract }) {
  const { contract } = props
  const { volume, createdDate, resolvedDate } = compute(contract)

  return (
    <Row className="flex-wrap text-sm text-gray-500">
      <div className="whitespace-nowrap">
        <UserLink username={contract.creatorUsername} />
      </div>
      <div className="mx-2">•</div>
      <div className="whitespace-nowrap">
        {resolvedDate ? `${createdDate} - ${resolvedDate}` : createdDate}
      </div>
      <div className="mx-2">•</div>
      <div className="whitespace-nowrap">{formatMoney(volume)} volume</div>
    </Row>
  )
}

function ContractCard(props: { contract: Contract }) {
  const { contract } = props
  const { probPercent } = compute(contract)

  const resolutionColor = {
    YES: 'text-primary',
    NO: 'text-red-400',
    CANCEL: 'text-yellow-400',
    '': '', // Empty if unresolved
  }[contract.resolution || '']

  const resolutionText = {
    YES: 'YES',
    NO: 'NO',
    CANCEL: 'N/A',
    '': '',
  }[contract.resolution || '']

  return (
    <Link href={path(contract)}>
      <a>
        <li className="col-span-1 bg-white hover:bg-gray-100 shadow-xl rounded-lg divide-y divide-gray-200">
          <div className="card">
            <div className="card-body p-6">
              <Row className="justify-between gap-2 mb-2">
                <p className="font-medium text-indigo-700">
                  {contract.question}
                </p>
                <div className={clsx('text-4xl', resolutionColor)}>
                  {resolutionText || (
                    <div className="text-primary">
                      {probPercent}
                      <div className="text-lg">chance</div>
                    </div>
                  )}
                </div>
              </Row>
              <ContractDetails contract={contract} />
            </div>
          </div>
        </li>
      </a>
    </Link>
  )
}

function ContractsGrid(props: { contracts: Contract[] }) {
  const [resolvedContracts, activeContracts] = _.partition(
    props.contracts,
    (c) => c.isResolved
  )
  const contracts = [...activeContracts, ...resolvedContracts]

  if (contracts.length === 0) {
    return (
      <p>
        No markets found. Would you like to{' '}
        <Link href="/create">
          <a className="text-green-500 hover:underline hover:decoration-2">
            create one
          </a>
        </Link>
        ?
      </p>
    )
  }

  return (
    <ul role="list" className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {contracts.map((contract) => (
        <ContractCard contract={contract} key={contract.id} />
      ))}
      {/* TODO: Show placeholder if empty */}
    </ul>
  )
}

type Sort = 'createdTime' | 'volume' | 'resolved' | 'all'
export function SearchableGrid(props: {
  contracts: Contract[]
  defaultSort?: Sort
}) {
  const { contracts, defaultSort } = props
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState(defaultSort || 'volume')

  function check(corpus: String) {
    return corpus.toLowerCase().includes(query.toLowerCase())
  }
  let matches = contracts.filter(
    (c) =>
      check(c.question) ||
      check(c.description) ||
      check(c.creatorName) ||
      check(c.creatorUsername)
  )

  if (sort === 'createdTime' || sort === 'resolved' || sort === 'all') {
    matches.sort((a, b) => b.createdTime - a.createdTime)
  } else if (sort === 'volume') {
    matches.sort((a, b) => compute(b).volume - compute(a).volume)
  }

  if (sort !== 'all') {
    // Filter for (or filter out) resolved contracts
    matches = matches.filter((c) =>
      sort === 'resolved' ? c.resolution : !c.resolution
    )
  }

  return (
    <div>
      {/* Show a search input next to a sort dropdown */}
      <div className="flex justify-between gap-2 my-8">
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
          <option value="resolved">Resolved</option>
          <option value="all">All markets</option>
        </select>
      </div>

      <ContractsGrid contracts={matches} />
    </div>
  )
}

export function ContractsList(props: { creator: User }) {
  const { creator } = props
  const [contracts, setContracts] = useState<Contract[]>([])

  useEffect(() => {
    if (creator?.id) {
      // TODO: stream changes from firestore
      listContracts(creator.id).then(setContracts)
    }
  }, [creator])

  return <SearchableGrid contracts={contracts} defaultSort="all" />
}
