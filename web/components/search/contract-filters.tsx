import clsx from 'clsx'
import { useGroupFromSlug } from 'web/hooks/use-group-supabase'
import { track } from 'web/lib/service/analytics'
import { Col } from '../layout/col'
import {
    getLabelFromValue,
} from './search-dropdown-helpers'

import router from 'next/router'
import { FaSliders } from 'react-icons/fa6'
import { IconButton } from 'web/components/buttons/button'
import { Spacer } from 'web/components/layout/spacer'
import { FilterPill } from './filter-pills'
import { Carousel } from 'web/components/widgets/carousel'
import { CONTRACT_TYPES, ContractTypeType, DEFAULT_FILTERS, DEFAULT_SORTS, FILTERS, Filter, SORTS, SearchParams, Sort, bountySorts, predictionMarketSorts } from '../supabase-search'

export function ContractFilters(props: {
  className?: string
  includeProbSorts?: boolean
  params: SearchParams
  updateParams: (params: Partial<SearchParams>) => void
  topicSlug: string
  showTopicTag?: boolean
  setTopicSlug?: (slug: string) => void
}) {
  const {
    className,
    topicSlug,
    setTopicSlug,
    includeProbSorts,
    params,
    updateParams,
    showTopicTag,
  } = props

  const { s: sort, f: filter, ct: contractType } = params

  const selectFilter = (selection: Filter) => {
    if (selection === filter) return

    updateParams({ f: selection })
    track('select search filter', { filter: selection })
  }

  const selectSort = (selection: Sort) => {
    if (selection === sort) return

    if (selection === 'close-date') {
      updateParams({ s: selection, f: 'open' })
    } else if (selection === 'resolve-date') {
      updateParams({ s: selection, f: 'resolved' })
    } else {
      updateParams({ s: selection })
    }

    track('select search sort', { sort: selection })
  }

  const selectContractType = (selection: ContractTypeType) => {
    if (selection === contractType) return

    if (selection === 'BOUNTIED_QUESTION' && predictionMarketSorts.has(sort)) {
      updateParams({ s: 'bounty-amount', ct: selection })
    } else if (selection !== 'BOUNTIED_QUESTION' && bountySorts.has(sort)) {
      updateParams({ s: 'score', ct: selection })
    } else {
      updateParams({ ct: selection })
    }
    track('select contract type', { contractType: selection })
  }
  const hideFilter =
    sort === 'resolve-date' ||
    sort === 'close-date' ||
    contractType === 'BOUNTIED_QUESTION'

  const filterLabel = getLabelFromValue(FILTERS, filter)
  const sortLabel = getLabelFromValue(SORTS, sort)
  const contractTypeLabel = getLabelFromValue(CONTRACT_TYPES, contractType)
  const topic = useGroupFromSlug(topicSlug ?? '')
  const resetTopic = () => router.push(`/browse`)

  return (
    <Col className={clsx('my-1 items-stretch gap-1 ', className)}>
      <Carousel labelsParentClassName="gap-1 items-center">
        <IconButton size="2xs" className="absolute left-0 top-0 z-20 p-1">
          <FaSliders className="h-4 w-4" />
        </IconButton>
        <Spacer w={8} />
        {!!setTopicSlug && (!topicSlug || topicSlug == 'for-you') && (
          <FilterPill
            selected={topicSlug === 'for-you'}
            onSelect={() => setTopicSlug('for-you')}
          >
            ⭐️ For you
          </FilterPill>
        )}
        {DEFAULT_SORTS.map((sortValue) => (
          <FilterPill
            key={sortValue}
            selected={sortValue === sort}
            onSelect={() => {
              if (sort === sortValue) {
                selectSort('score')
              } else {
                selectSort(sortValue as Sort)
              }
            }}
          >
            {getLabelFromValue(SORTS, sortValue)}
          </FilterPill>
        ))}
        {DEFAULT_FILTERS.map((filterValue) => (
          <FilterPill
            key={filterValue}
            selected={filterValue === filter}
            onSelect={() => {
              console.log(filterValue, filter)
              if (filterValue === filter) {
                selectFilter('all')
              } else {
                selectFilter(filterValue as Filter)
              }
            }}
          >
            {getLabelFromValue(FILTERS, filterValue)}
          </FilterPill>
        ))}
      </Carousel>
    </Col>
  )
}
