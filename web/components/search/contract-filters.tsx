import clsx from 'clsx'
import { track } from 'web/lib/service/analytics'
import { Col } from '../layout/col'
import { getLabelFromValue } from './search-dropdown-helpers'

import { useState } from 'react'
import { FaSortAmountDownAlt } from 'react-icons/fa'
import { FaDroplet, FaFileContract, FaFilter, FaSliders } from 'react-icons/fa6'
import { IconButton } from 'web/components/buttons/button'
import { Carousel } from 'web/components/widgets/carousel'

import { MODAL_CLASS, Modal } from '../layout/modal'
import { Row } from '../layout/row'
import {
  BOUNTY_MARKET_SORTS,
  CONTRACT_TYPES,
  ContractTypeType,
  DEFAULT_BOUNTY_SORTS,
  DEFAULT_CONTRACT_TYPE,
  DEFAULT_CONTRACT_TYPES,
  DEFAULT_FILTER,
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  DEFAULT_SORTS,
  FILTERS,
  FILTER_KEY,
  FOR_YOU_KEY,
  Filter,
  GROUP_IDS_KEY,
  POLL_SORTS,
  PREDICTION_MARKET_PROB_SORTS,
  PREDICTION_MARKET_SORTS,
  SORTS,
  SearchParams,
  Sort,
  bountySorts,
  predictionMarketSorts,
} from '../search'
import { SweepsToggle } from '../sweeps/sweeps-toggle'
import { useSweepstakes } from '../sweepstakes-provider'
import {
  AdditionalFilterPill,
  FilterDropdownPill,
  FilterPill,
  minimalistIndigoSelectedClass,
  unselectedClass,
} from './filter-pills'
import { useUser } from 'web/hooks/use-user'
import { LIQUIDITY_KEY } from '../search'
import { formatMoney } from 'common/util/format'
import { liquidityTiers } from 'common/tier'

export const LIQUIDITY_TIER_LABELS = liquidityTiers.map((tier) => ({
  label: formatMoney(tier) + '+',
  value: tier.toString(),
}))

export function ContractFilters(props: {
  className?: string
  params: SearchParams
  updateParams: (params: Partial<SearchParams>) => void
  topicSlug?: string
  hideSweepsToggle?: boolean
}) {
  const { className, params, updateParams, hideSweepsToggle, topicSlug } = props
  const user = useUser()

  const {
    s: sort,
    f: filter,
    ct: contractType,
    sw: isSweepiesString,
    li: liquidity,
    hb: hasBets,
  } = params
  const isSweeps = isSweepiesString === '1'
  const { setPrefersPlay } = useSweepstakes()

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

  const selectLiquidityFilter = (selection: string) => {
    if (selection === liquidity) {
      updateParams({ [LIQUIDITY_KEY]: '' })
    } else {
      updateParams({ [LIQUIDITY_KEY]: selection })
      track('select liquidity tier', { tier: selection })
    }
  }

  const toggleSweepies = () => {
    setPrefersPlay(isSweeps)
    updateParams({
      sw: isSweeps ? '0' : '1',
    })
  }

  const hideFilter =
    sort === 'resolve-date' ||
    sort === 'close-date' ||
    contractType === 'BOUNTIED_QUESTION'

  const liquidityFilter = LIQUIDITY_TIER_LABELS.find(
    (tier) => tier.value === liquidity
  )
  const sortLabel = getLabelFromValue(SORTS, sort)
  const contractTypeLabel = getLabelFromValue(CONTRACT_TYPES, contractType)

  const extraSortOptions =
    contractType == 'BOUNTIED_QUESTION' ? DEFAULT_BOUNTY_SORTS : []

  const [openFilterModal, setOpenFilterModal] = useState(false)

  const nonDefaultSort =
    !DEFAULT_SORTS.some((s) => s == sort) && sort !== DEFAULT_SORT
  const nonDefaultContractType =
    !DEFAULT_CONTRACT_TYPES.some((ct) => ct == contractType) &&
    contractType !== DEFAULT_CONTRACT_TYPE

  const forYou =
    params[FOR_YOU_KEY] === '1' && !params[GROUP_IDS_KEY] && filter !== 'news'

  return (
    <Col className={clsx('mb-1 mt-2 items-stretch gap-1 ', className)}>
      <Carousel fadeEdges labelsParentClassName="gap-1 items-center">
        {isSweeps && !hideSweepsToggle && (
          <SweepsToggle
            sweepsEnabled={true}
            isPlay={!isSweeps}
            onClick={toggleSweepies}
            isSmall
          />
        )}

        <Row className="bg-ink-100 dark:bg-ink-300 items-center rounded-full ">
          <button
            key="score"
            className={clsx(
              'flex cursor-pointer select-none flex-row items-center whitespace-nowrap rounded-full px-3 py-0.5 text-sm outline-none transition-colors',
              sort == 'score' ? minimalistIndigoSelectedClass : unselectedClass,
              className
            )}
            onClick={() => {
              if (sort === 'score') {
                selectSort('freshness-score')
              } else {
                selectSort('score')
              }
            }}
          >
            Best
          </button>
          <button
            key="freshness-score"
            className={clsx(
              'flex cursor-pointer select-none flex-row items-center whitespace-nowrap rounded-full px-3 py-0.5 text-sm outline-none transition-colors',
              sort == 'freshness-score'
                ? minimalistIndigoSelectedClass
                : unselectedClass,
              className
            )}
            onClick={() => {
              if (sort === 'freshness-score') {
                selectSort('score')
              } else {
                selectSort('freshness-score')
              }
            }}
          >
            Hot
          </button>
          <button
            key="newest"
            className={clsx(
              'flex cursor-pointer select-none flex-row items-center whitespace-nowrap rounded-full px-3 py-0.5 text-sm outline-none transition-colors',
              sort == 'newest'
                ? minimalistIndigoSelectedClass
                : unselectedClass,
              className
            )}
            onClick={() => {
              if (sort === 'newest') {
                selectSort('score')
              } else {
                selectSort('newest')
              }
            }}
          >
            New
          </button>
        </Row>
        {extraSortOptions.map((sortValue) => (
          <FilterPill
            key={sortValue}
            selected={sortValue === sort}
            onSelect={() => {
              if (sort === sortValue) {
                selectSort(DEFAULT_SORT)
              } else {
                selectSort(sortValue as Sort)
              }
            }}
          >
            {getLabelFromValue(SORTS, sortValue)}
          </FilterPill>
        ))}

        <FilterDropdownPill
          selectFilter={selectFilter}
          currentFilter={filter}
        />
        {user && (
          <FilterPill
            selected={hasBets === '1'}
            onSelect={() => {
              updateParams({
                hb: hasBets === '1' ? '0' : '1',
              })
            }}
          >
            Your bets
          </FilterPill>
        )}
        {nonDefaultSort && (
          <AdditionalFilterPill onXClick={() => selectSort(DEFAULT_SORT)}>
            {sortLabel}
          </AdditionalFilterPill>
        )}
        {liquidityFilter && (
          <AdditionalFilterPill
            onXClick={() => selectLiquidityFilter(liquidityFilter.value)}
          >
            {liquidityFilter.label}
          </AdditionalFilterPill>
        )}
        {nonDefaultContractType && (
          <AdditionalFilterPill
            onXClick={() => selectContractType(DEFAULT_CONTRACT_TYPE)}
          >
            {contractTypeLabel}
          </AdditionalFilterPill>
        )}
        {forYou && (
          <AdditionalFilterPill
            onXClick={() => {
              updateParams({
                [FOR_YOU_KEY]: '0',
              })
            }}
          >
            For you
          </AdditionalFilterPill>
        )}
        {!hideFilter &&
          DEFAULT_FILTERS.map((filterValue) => (
            <FilterPill
              key={filterValue}
              selected={filterValue === filter}
              onSelect={() => {
                if (filterValue === filter) {
                  selectFilter(DEFAULT_FILTER)
                } else {
                  selectFilter(filterValue as Filter)
                }
              }}
            >
              {getLabelFromValue(FILTERS, filterValue)}
            </FilterPill>
          ))}
        {DEFAULT_CONTRACT_TYPES.map((contractValue) => (
          <FilterPill
            key={contractValue}
            selected={contractValue === contractType}
            onSelect={() => {
              if (contractValue === contractType) {
                selectContractType(DEFAULT_CONTRACT_TYPE)
              } else {
                selectContractType(contractValue as ContractTypeType)
              }
            }}
          >
            {getLabelFromValue(CONTRACT_TYPES, contractValue)}
          </FilterPill>
        ))}
        <IconButton size="2xs" onClick={() => setOpenFilterModal(true)}>
          <FaSliders className="h-4 w-4" />
        </IconButton>
      </Carousel>
      <FilterModal
        open={openFilterModal}
        setOpen={setOpenFilterModal}
        params={params}
        selectFilter={selectFilter}
        selectSort={selectSort}
        selectContractType={selectContractType}
        selectLiquidityTier={selectLiquidityFilter}
        toggleSweepies={toggleSweepies}
        hideFilter={hideFilter}
        updateParams={updateParams}
        forYou={forYou}
        topicSlug={topicSlug}
      />
    </Col>
  )
}

function FilterModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
  params: SearchParams
  selectFilter: (selection: Filter) => void
  selectSort: (selection: Sort) => void
  selectContractType: (selection: ContractTypeType) => void
  selectLiquidityTier: (selection: string) => void
  toggleSweepies: () => void
  hideFilter: boolean
  updateParams: (params: Partial<SearchParams>) => void
  forYou: boolean
  topicSlug?: string
}) {
  const {
    open,
    setOpen,
    params,
    selectFilter,
    selectContractType,
    selectSort,
    selectLiquidityTier,
    toggleSweepies,
    hideFilter,
    updateParams,
    forYou,
    topicSlug,
  } = props
  const {
    s: sort,
    f: filter,
    ct: contractType,
    sw: isSweepiesString,
    li: liquidityTier,
  } = params

  const user = useUser()

  const sortItems =
    contractType == 'BOUNTIED_QUESTION'
      ? BOUNTY_MARKET_SORTS
      : contractType == 'POLL'
      ? POLL_SORTS
      : contractType === 'ALL' || contractType === 'BINARY'
      ? PREDICTION_MARKET_PROB_SORTS
      : PREDICTION_MARKET_SORTS

  return (
    <Modal open={open} setOpen={setOpen}>
      <Col className={clsx(MODAL_CLASS, 'text-ink-600 !items-stretch text-sm')}>
        {!hideFilter && (
          <Col className="gap-2">
            <Row className="items-center gap-1 font-semibold">
              <FaFilter className="h-4 w-4" />
              Filters
            </Row>
            <Row className="flex-wrap gap-1">
              {!hideFilter &&
                FILTERS.map(({ label: filterLabel, value: filterValue }) => (
                  <FilterPill
                    key={filterValue}
                    selected={filterValue === filter}
                    onSelect={() => {
                      if (filterValue === filter) {
                        selectFilter(DEFAULT_FILTER)
                      } else {
                        selectFilter(filterValue as Filter)
                      }
                    }}
                  >
                    {filterLabel}
                  </FilterPill>
                ))}
              <FilterPill
                selected={isSweepiesString === '1'}
                onSelect={toggleSweepies}
              >
                Sweepstakes
              </FilterPill>
              {user && (
                <FilterPill
                  disabled={!!topicSlug}
                  selected={forYou}
                  onSelect={() => {
                    updateParams({
                      [FOR_YOU_KEY]: forYou ? '0' : '1',
                      [GROUP_IDS_KEY]: '', // Clear any topic selection when toggling For You
                      [FILTER_KEY]: filter === 'news' ? 'open' : filter,
                    })
                  }}
                >
                  For you
                </FilterPill>
              )}
            </Row>
            <Row className="items-center gap-1 font-semibold">
              <FaDroplet className="h-4 w-4" />
              Liquidity filters
            </Row>
            <Row className="flex-wrap gap-1">
              {LIQUIDITY_TIER_LABELS.slice(1, LIQUIDITY_TIER_LABELS.length).map(
                ({ label, value }) => (
                  <FilterPill
                    key={value}
                    selected={value === liquidityTier}
                    onSelect={() => selectLiquidityTier(value)}
                  >
                    {label}
                  </FilterPill>
                )
              )}
            </Row>
          </Col>
        )}
        <Col className="gap-2">
          <Row className="items-center gap-1 font-semibold">
            <FaSortAmountDownAlt className="h-4 w-4" />
            Sorts
          </Row>
          <Row className="flex-wrap gap-1">
            {sortItems.map(({ label: sortLabel, value: sortValue }) => (
              <FilterPill
                key={sortValue}
                selected={sortValue === sort}
                onSelect={() => {
                  if (sortValue === sort) {
                    selectSort(DEFAULT_SORT)
                  } else {
                    selectSort(sortValue as Sort)
                  }
                }}
              >
                {sortLabel}
              </FilterPill>
            ))}
          </Row>
        </Col>
        <Col className="gap-2">
          <Row className="items-center gap-1 font-semibold">
            <FaFileContract className="h-4 w-4" />
            Market Type
          </Row>
          <Row className="flex-wrap gap-1">
            {CONTRACT_TYPES.map(
              ({ label: contractTypeLabel, value: contractTypeValue }) => (
                <FilterPill
                  key={contractTypeValue}
                  selected={contractTypeValue === contractType}
                  onSelect={() => {
                    if (contractTypeValue === contractType) {
                      selectContractType(DEFAULT_CONTRACT_TYPE)
                    } else {
                      selectContractType(contractTypeValue as ContractTypeType)
                    }
                  }}
                >
                  {contractTypeLabel}
                </FilterPill>
              )
            )}
          </Row>
        </Col>
      </Col>
    </Modal>
  )
}

function ToggleButton(props: {
  onClick: () => void
  selected: boolean
  children: React.ReactNode
}) {
  const { onClick, selected, children } = props
  return (
    <button
      className={clsx(
        'flex h-full items-center rounded px-3 transition-colors',
        selected
          ? 'bg-indigo-600 text-white'
          : 'dark:bg-ink-300 dark:text-ink-600 text-ink-500 bg-ink-200 hover:bg-ink-300 dark:hover:bg-ink-400'
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function BestHotToggle(props: {
  sort: Sort
  onChange: (params: Partial<SearchParams>) => void
}) {
  const { sort, onChange } = props

  return (
    <Row className="h-8 gap-1 rounded text-sm">
      <ToggleButton
        onClick={() => {
          if (sort === 'score') {
            onChange({ s: 'freshness-score' })
          }
          onChange({ s: 'score' })
        }}
        selected={sort == 'score'}
      >
        Best
      </ToggleButton>
      <ToggleButton
        onClick={() => {
          if (sort === 'freshness-score') {
            onChange({ s: 'score' })
          }
          onChange({ s: 'freshness-score' })
        }}
        selected={sort == 'freshness-score'}
      >
        Hot
      </ToggleButton>
    </Row>
  )
}
