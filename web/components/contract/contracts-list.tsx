import _ from 'lodash'
import Link from 'next/link'
import clsx from 'clsx'
import { useEffect, useState } from 'react'

import {
  contractMetrics,
  Contract,
  listContracts,
  getBinaryProb,
} from '../../lib/firebase/contracts'
import { User } from '../../lib/firebase/users'
import { Col } from '../layout/col'
import { SiteLink } from '../site-link'
import { ContractCard } from './contract-card'
import {
  Sort,
  useQueryAndSortParams,
} from '../../hooks/use-sort-and-query-params'
import { Answer } from '../../../common/answer'
import { LoadingIndicator } from '../loading-indicator'

export function ContractsGrid(props: {
  contracts: Contract[]
  showHotVolume?: boolean
  showCloseTime?: boolean
}) {
  const { showCloseTime } = props
  const PAGE_SIZE = 100
  const [page, setPage] = useState(1)

  const [resolvedContracts, activeContracts] = _.partition(
    props.contracts,
    (c) => c.isResolved
  )
  const allContracts = [...activeContracts, ...resolvedContracts]
  const showMore = allContracts.length > PAGE_SIZE * page
  const contracts = allContracts.slice(0, PAGE_SIZE * page)

  if (contracts.length === 0) {
    return (
      <p className="mx-2 text-gray-500">
        No markets found. Why not{' '}
        <SiteLink href="/home" className="font-bold text-gray-700">
          create one?
        </SiteLink>
      </p>
    )
  }

  return (
    <>
      <ul className="grid w-full grid-cols-1 gap-6 md:grid-cols-2">
        {contracts.map((contract) => (
          <ContractCard
            contract={contract}
            key={contract.id}
            // showHotVolume={showHotVolume}
            showCloseTime={showCloseTime}
          />
        ))}
      </ul>
      {/* Show a link that increases the page num when clicked */}
      {showMore && (
        <button
          className="btn btn-link float-right normal-case"
          onClick={() => setPage(page + 1)}
        >
          Show more...
        </button>
      )}
    </>
  )
}

const MAX_GROUPED_CONTRACTS_DISPLAYED = 6

function CreatorContractsGrid(props: { contracts: Contract[] }) {
  const { contracts } = props

  const byCreator = _.groupBy(contracts, (contract) => contract.creatorId)
  const creator7DayVol = _.mapValues(byCreator, (contracts) =>
    _.sumBy(contracts, (contract) => contract.volume7Days)
  )
  const creatorIds = _.sortBy(
    Object.keys(byCreator),
    (creatorId) => -1 * creator7DayVol[creatorId]
  )

  let numContracts = 0
  let maxIndex = 0
  for (; maxIndex < creatorIds.length; maxIndex++) {
    numContracts += Math.min(
      MAX_GROUPED_CONTRACTS_DISPLAYED,
      byCreator[creatorIds[maxIndex]].length
    )
    if (numContracts > MAX_CONTRACTS_DISPLAYED) break
  }

  const creatorIdsSubset = creatorIds.slice(0, maxIndex)

  return (
    <Col className="gap-6">
      {creatorIdsSubset.map((creatorId) => {
        const { creatorUsername, creatorName } = byCreator[creatorId][0]

        return (
          <Col className="gap-4" key={creatorUsername}>
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

  const contractTags = _.flatMap(contracts, (contract) => {
    const { tags } = contract
    return tags.map((tag) => ({
      tag,
      contract,
    }))
  })
  const groupedByTag = _.groupBy(contractTags, ({ tag }) => tag)
  const byTag = _.mapValues(groupedByTag, (contractTags) =>
    contractTags.map(({ contract }) => contract)
  )
  const tag7DayVol = _.mapValues(byTag, (contracts) =>
    _.sumBy(contracts, (contract) => contract.volume7Days)
  )
  const tags = _.sortBy(
    Object.keys(byTag),
    (creatorId) => -1 * tag7DayVol[creatorId]
  )

  let numContracts = 0
  let maxIndex = 0
  for (; maxIndex < tags.length; maxIndex++) {
    numContracts += Math.min(
      MAX_GROUPED_CONTRACTS_DISPLAYED,
      byTag[tags[maxIndex]].length
    )
    if (numContracts > MAX_CONTRACTS_DISPLAYED) break
  }

  const tagsSubset = tags.slice(0, maxIndex)

  return (
    <Col className="gap-6">
      {tagsSubset.map((tag) => {
        return (
          <Col className="gap-4" key={tag}>
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

export function SearchableGrid(props: {
  contracts: Contract[] | undefined
  byOneCreator?: boolean
  querySortOptions?: {
    defaultSort: Sort
    shouldLoadFromStorage?: boolean
  }
}) {
  const { contracts, byOneCreator, querySortOptions } = props

  const { query, setQuery, sort, setSort } =
    useQueryAndSortParams(querySortOptions)

  const queryWords = query.toLowerCase().split(' ')
  function check(corpus: String) {
    return queryWords.every((word) => corpus.toLowerCase().includes(word))
  }

  let matches = (contracts ?? []).filter(
    (c) =>
      check(c.question) ||
      check(c.description) ||
      check(c.creatorName) ||
      check(c.creatorUsername) ||
      check(c.lowercaseTags.map((tag) => `#${tag}`).join(' ')) ||
      check(
        ((c as any).answers ?? [])
          .map((answer: Answer) => answer.text)
          .join(' ')
      )
  )

  if (sort === 'newest' || sort === 'all') {
    matches.sort((a, b) => b.createdTime - a.createdTime)
  } else if (sort === 'resolved') {
    matches = _.sortBy(
      matches,
      (contract) => -1 * (contract.resolutionTime ?? 0)
    )
  } else if (sort === 'oldest') {
    matches.sort((a, b) => a.createdTime - b.createdTime)
  } else if (sort === 'close-date' || sort === 'closed') {
    matches = _.sortBy(matches, ({ volume24Hours }) => -1 * volume24Hours)
    matches = _.sortBy(
      matches,
      (contract) =>
        (sort === 'closed' ? -1 : 1) * (contract.closeTime ?? Infinity)
    )
    const hideClosed = sort === 'closed'
    matches = matches.filter(
      ({ closeTime }) => closeTime && closeTime > Date.now() !== hideClosed
    )
  } else if (sort === 'most-traded') {
    matches.sort((a, b) => b.volume - a.volume)
  } else if (sort === '24-hour-vol') {
    // Use lodash for stable sort, so previous sort breaks all ties.
    matches = _.sortBy(matches, ({ volume7Days }) => -1 * volume7Days)
    matches = _.sortBy(matches, ({ volume24Hours }) => -1 * volume24Hours)
  } else if (sort === 'creator' || sort === 'tag') {
    matches.sort((a, b) => b.volume7Days - a.volume7Days)
  } else if (sort === 'most-likely') {
    matches = _.sortBy(matches, (contract) => -getBinaryProb(contract))
  } else if (sort === 'least-likely') {
    // Exclude non-binary contracts
    matches = matches.filter((contract) => getBinaryProb(contract) !== 0)
    matches = _.sortBy(matches, (contract) => getBinaryProb(contract))
  }

  if (sort !== 'all') {
    // Filter for (or filter out) resolved contracts
    matches = matches.filter((c) =>
      sort === 'resolved' ? c.resolution : !c.resolution
    )

    // Filter out closed contracts.
    if (sort !== 'closed' && sort !== 'resolved') {
      matches = matches.filter((c) => !c.closeTime || c.closeTime > Date.now())
    }
  }

  return (
    <div>
      {/* Show a search input next to a sort dropdown */}
      <div className="mt-2 mb-8 flex justify-between gap-2">
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
          <option value="most-traded">Most traded</option>
          <option value="24-hour-vol">24h volume</option>
          <option value="close-date">Closing soon</option>
          <option value="closed">Closed</option>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="most-likely">Most likely</option>
          <option value="least-likely">Least likely</option>

          <option value="tag">By tag</option>
          {!byOneCreator && <option value="creator">By creator</option>}
          <option value="resolved">Resolved</option>
          {byOneCreator && <option value="all">All markets</option>}
        </select>
      </div>

      {contracts === undefined ? (
        <LoadingIndicator />
      ) : sort === 'tag' ? (
        <TagContractsGrid contracts={matches} />
      ) : !byOneCreator && sort === 'creator' ? (
        <CreatorContractsGrid contracts={matches} />
      ) : (
        <ContractsGrid
          contracts={matches}
          showCloseTime={['close-date', 'closed'].includes(sort)}
        />
      )}
    </div>
  )
}

export function CreatorContractsList(props: { contracts: Contract[] }) {
  const { contracts } = props
  return (
    <SearchableGrid
      contracts={contracts}
      byOneCreator
      querySortOptions={{
        defaultSort: 'all',
        shouldLoadFromStorage: false,
      }}
    />
  )
}
