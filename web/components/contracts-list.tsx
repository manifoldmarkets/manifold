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
import { Linkify } from './linkify'
import { Col } from './layout/col'
import { SiteLink } from './link'

export function ContractDetails(props: { contract: Contract }) {
  const { contract } = props
  const { truePool, createdDate, resolvedDate } = compute(contract)

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
      <div className="whitespace-nowrap">{formatMoney(truePool)} pool</div>
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
        <li className="col-span-1 bg-white hover:bg-gray-100 shadow-md rounded-lg divide-y divide-gray-200">
          <div className="card">
            <div className="card-body p-6">
              <Row className="justify-between gap-4 mb-2">
                <p className="font-medium text-indigo-700">
                  <Linkify text={contract.question} />
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
      <p className="mx-4">
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
    </ul>
  )
}

export function CreatorContractsGrid(props: { contracts: Contract[] }) {
  const { contracts } = props

  const byCreator = _.groupBy(contracts, (contract) => contract.creatorId)
  const creatorIds = _.sortBy(Object.keys(byCreator), (creatorId) =>
    _.sumBy(byCreator[creatorId], (contract) => -1 * compute(contract).truePool)
  )

  return (
    <Col className="gap-6">
      {creatorIds.map((creatorId) => {
        const { creatorUsername, creatorName } = byCreator[creatorId][0]

        return (
          <Col className="gap-6">
            <SiteLink href={`/${creatorUsername}`}>{creatorName}</SiteLink>

            <ul role="list" className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {byCreator[creatorId].slice(0, 6).map((contract) => (
                <ContractCard contract={contract} key={contract.id} />
              ))}
            </ul>

            {byCreator[creatorId].length > 6 ? (
              <Link href={`/${creatorUsername}`}>
                <a
                  className={clsx(
                    'self-end hover:underline hover:decoration-indigo-400 hover:decoration-2'
                  )}
                  onClick={(e) => e.stopPropagation()}
                >
                  See all
                </a>
              </Link>
            ) : (
              <div />
            )}
          </Col>
        )
      })}
    </Col>
  )
}

const MAX_CONTRACTS_DISPLAYED = 99

type Sort = 'creator' | 'createdTime' | 'pool' | 'resolved' | 'all'
export function SearchableGrid(props: {
  contracts: Contract[]
  defaultSort?: Sort
  byOneCreator?: boolean
}) {
  const { contracts, defaultSort, byOneCreator } = props
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState(
    defaultSort || (byOneCreator ? 'pool' : 'creator')
  )

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
  } else if (sort === 'pool' || sort === 'creator') {
    matches.sort((a, b) => compute(b).truePool - compute(a).truePool)
  }

  if (sort !== 'all') {
    // Filter for (or filter out) resolved contracts
    matches = matches.filter((c) =>
      sort === 'resolved' ? c.resolution : !c.resolution
    )
  }

  if (matches.length > MAX_CONTRACTS_DISPLAYED)
    matches = _.slice(matches, 0, MAX_CONTRACTS_DISPLAYED)

  return (
    <div>
      {/* Show a search input next to a sort dropdown */}
      <div className="flex justify-between gap-2 mt-2 mb-8">
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
          {byOneCreator ? (
            <option value="all">All markets</option>
          ) : (
            <option value="creator">By creator</option>
          )}
          <option value="pool">Most traded</option>
          <option value="createdTime">Newest first</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>

      {!byOneCreator && (sort === 'creator' || sort === 'resolved') ? (
        <CreatorContractsGrid contracts={matches} />
      ) : (
        <ContractsGrid contracts={matches} />
      )}
    </div>
  )
}

export function CreatorContractsList(props: { creator: User }) {
  const { creator } = props
  const [contracts, setContracts] = useState<Contract[] | 'loading'>('loading')

  useEffect(() => {
    if (creator?.id) {
      // TODO: stream changes from firestore
      listContracts(creator.id).then(setContracts)
    }
  }, [creator])

  if (contracts === 'loading') return <></>

  return <SearchableGrid contracts={contracts} byOneCreator defaultSort="all" />
}
