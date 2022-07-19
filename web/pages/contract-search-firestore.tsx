import { Answer } from 'common/answer'
import { searchInAny } from 'common/util/parse'
import { sortBy } from 'lodash'
import { useState } from 'react'
import { ContractsGrid } from 'web/components/contract/contracts-list'
import { LoadingIndicator } from 'web/components/loading-indicator'
import { useContracts } from 'web/hooks/use-contracts'
import {
  Sort,
  useInitialQueryAndSort,
} from 'web/hooks/use-sort-and-query-params'

const MAX_CONTRACTS_RENDERED = 100

export default function ContractSearchFirestore(props: {
  querySortOptions?: {
    defaultSort: Sort
    shouldLoadFromStorage?: boolean
  }
  additionalFilter?: {
    creatorId?: string
    tag?: string
  }
}) {
  const contracts = useContracts()
  const { querySortOptions, additionalFilter } = props

  const { initialSort, initialQuery } = useInitialQueryAndSort(querySortOptions)
  const [sort, setSort] = useState(initialSort || 'newest')
  const [query, setQuery] = useState(initialQuery)

  let matches = (contracts ?? []).filter((c) =>
    searchInAny(
      query,
      c.question,
      c.creatorName,
      c.lowercaseTags.map((tag) => `#${tag}`).join(' '),
      ((c as any).answers ?? []).map((answer: Answer) => answer.text).join(' ')
    )
  )

  if (sort === 'newest') {
    matches.sort((a, b) => b.createdTime - a.createdTime)
  } else if (sort === 'resolve-date') {
    matches = sortBy(matches, (contract) => -1 * (contract.resolutionTime ?? 0))
  } else if (sort === 'oldest') {
    matches.sort((a, b) => a.createdTime - b.createdTime)
  } else if (sort === 'close-date') {
    matches = sortBy(matches, ({ volume24Hours }) => -1 * volume24Hours)
    matches = sortBy(
      matches,
      (contract) =>
        (sort === 'close-date' ? -1 : 1) * (contract.closeTime ?? Infinity)
    )
  } else if (sort === 'most-traded') {
    matches.sort((a, b) => b.volume - a.volume)
  } else if (sort === 'score') {
    matches.sort((a, b) => (b.popularityScore ?? 0) - (a.popularityScore ?? 0))
  } else if (sort === '24-hour-vol') {
    // Use lodash for stable sort, so previous sort breaks all ties.
    matches = sortBy(matches, ({ volume7Days }) => -1 * volume7Days)
    matches = sortBy(matches, ({ volume24Hours }) => -1 * volume24Hours)
  }

  if (additionalFilter) {
    const { creatorId, tag } = additionalFilter

    if (creatorId) {
      matches = matches.filter((c) => c.creatorId === creatorId)
    }

    if (tag) {
      matches = matches.filter((c) =>
        c.lowercaseTags.includes(tag.toLowerCase())
      )
    }
  }

  matches = matches.slice(0, MAX_CONTRACTS_RENDERED)

  const showTime = ['close-date', 'closed'].includes(sort)
    ? 'close-date'
    : sort === 'resolve-date'
    ? 'resolve-date'
    : undefined

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
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="score">Most popular</option>
          <option value="most-traded">Most traded</option>
          <option value="24-hour-vol">24h volume</option>
          <option value="close-date">Closing soon</option>
        </select>
      </div>
      {contracts === undefined ? (
        <LoadingIndicator />
      ) : (
        <ContractsGrid
          contracts={matches}
          loadMore={() => {}}
          hasMore={false}
          showTime={showTime}
        />
      )}
    </div>
  )
}
