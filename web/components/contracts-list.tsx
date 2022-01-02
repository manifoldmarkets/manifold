import _ from 'lodash'
import Link from 'next/link'
import clsx from 'clsx'
import { useEffect, useState } from 'react'

import {
  compute,
  Contract,
  listContracts,
  path,
} from '../lib/firebase/contracts'
import { User } from '../lib/firebase/users'
import { Col } from './layout/col'
import { SiteLink } from './site-link'
import { parseTags } from '../lib/util/parse'
import { ContractCard } from './contract-card'

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

const MAX_GROUPED_CONTRACTS_DISPLAYED = 6

function CreatorContractsGrid(props: { contracts: Contract[] }) {
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
          <Col className="gap-4">
            <SiteLink className="text-lg" href={`/${creatorUsername}`}>
              {creatorName}
            </SiteLink>

            <ul role="list" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {byCreator[creatorId]
                .slice(0, MAX_GROUPED_CONTRACTS_DISPLAYED)
                .map((contract) => (
                  <ContractCard contract={contract} key={contract.id} />
                ))}
            </ul>

            {byCreator[creatorId].length > MAX_GROUPED_CONTRACTS_DISPLAYED ? (
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

function TagContractsGrid(props: { contracts: Contract[] }) {
  const { contracts } = props

  const contractTags = _.flatMap(contracts, (contract) =>
    parseTags(contract.question + ' ' + contract.description).map((tag) => ({
      tag,
      contract,
    }))
  )
  const groupedByTag = _.groupBy(contractTags, ({ tag }) => tag)
  const byTag = _.mapValues(groupedByTag, (contractTags) =>
    contractTags.map(({ contract }) => contract)
  )
  const tags = _.sortBy(Object.keys(byTag), (tag) =>
    _.sumBy(byTag[tag], (contract) => -1 * compute(contract).truePool)
  )

  return (
    <Col className="gap-6">
      {tags.map((tag) => {
        return (
          <Col className="gap-4">
            <SiteLink className="text-lg" href={`/tag/${tag}`}>
              #{tag}
            </SiteLink>

            <ul role="list" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {byTag[tag]
                .slice(0, MAX_GROUPED_CONTRACTS_DISPLAYED)
                .map((contract) => (
                  <ContractCard contract={contract} key={contract.id} />
                ))}
            </ul>

            {byTag[tag].length > MAX_GROUPED_CONTRACTS_DISPLAYED ? (
              <Link href={`/tag/${tag}`}>
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

type Sort = 'creator' | 'tag' | 'createdTime' | 'pool' | 'resolved' | 'all'
export function SearchableGrid(props: {
  contracts: Contract[]
  sort?: Sort
  setSort: (sort: Sort) => void
  byOneCreator?: boolean
}) {
  const { contracts, sort, setSort, byOneCreator } = props
  const [query, setQuery] = useState('')
  // const [sort, setSort] = useState(
  //   defaultSort || (byOneCreator ? 'pool' : 'creator')
  // )

  // useEffect(() => {
  //   if (defaultSort) setSort(defaultSort)
  // }, [defaultSort])

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
  } else if (sort === 'pool' || sort === 'creator' || sort === 'tag') {
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
          <option value="tag">By tag</option>
          <option value="pool">Most traded</option>
          <option value="createdTime">Newest first</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>

      {sort === 'tag' ? (
        <TagContractsGrid contracts={matches} />
      ) : !byOneCreator && (sort === 'creator' || sort === 'resolved') ? (
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

  return (
    <SearchableGrid
      contracts={contracts}
      byOneCreator
      sort="all"
      setSort={() => {}}
    />
  )
}
