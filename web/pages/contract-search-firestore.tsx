import { useRouter } from 'next/router'
import { Answer } from 'common/answer'
import { searchInAny } from 'common/util/parse'
import { sortBy } from 'lodash'
import { ContractsGrid } from 'web/components/contract/contracts-grid'
import { useAllContracts } from 'web/hooks/use-contracts'
import {
  usePersistentState,
  urlParamStore,
} from 'web/hooks/use-persistent-state'
import { PAST_BETS } from 'common/user'
import { Input } from 'web/components/widgets/input'
import { Select } from 'web/components/widgets/select'

const MAX_CONTRACTS_RENDERED = 100

export default function ContractSearchFirestore(props: {
  additionalFilter?: {
    creatorId?: string
    tag?: string
    excludeContractIds?: string[]
    groupSlug?: string
  }
}) {
  const { additionalFilter } = props
  const contracts = useAllContracts()
  const router = useRouter()
  const store = urlParamStore(router)
  const [query, setQuery] = usePersistentState('', { key: 'q', store })
  const [sort, setSort] = usePersistentState('score', { key: 'sort', store })

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
  } else if (sort === 'close-date') {
    matches = sortBy(matches, ({ volume24Hours }) => -1 * volume24Hours)
    matches = sortBy(matches, (contract) => contract.closeTime ?? Infinity)
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
    const { creatorId, tag, groupSlug, excludeContractIds } = additionalFilter

    if (creatorId) {
      matches = matches.filter((c) => c.creatorId === creatorId)
    }

    if (tag) {
      matches = matches.filter((c) =>
        c.lowercaseTags.includes(tag.toLowerCase())
      )
    }

    if (groupSlug) {
      matches = matches.filter((c) => c.groupSlugs?.includes(groupSlug))
    }

    if (excludeContractIds) {
      matches = matches.filter((c) => !excludeContractIds.includes(c.id))
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
        <Input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search markets"
          className="w-full"
        />
        <Select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="score">Trending</option>
          <option value="newest">Newest</option>
          <option value="most-traded">Most ${PAST_BETS}</option>
          <option value="24-hour-vol">24h volume</option>
          <option value="close-date">Closing soon</option>
        </Select>
      </div>
      <ContractsGrid contracts={matches} showTime={showTime} />
    </div>
  )
}
