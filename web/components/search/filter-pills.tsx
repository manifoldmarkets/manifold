import { ChevronDownIcon, XCircleIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { MarketTierType, TierParamsType, tiers } from 'common/tier'
import { ReactNode } from 'react'
import {
  CrystalTier,
  PlusTier,
  PremiumTier,
} from 'web/public/custom-components/tiers'
import { Row } from '../layout/row'
import CheckedDropdownMenu from '../widgets/checked-dropdown'
import {
  FILTERS,
  FOR_YOU_KEY,
  Filter,
  SearchParams,
  TOPIC_FILTER_KEY,
} from '../supabase-search'
import DropdownMenu from '../comments/dropdown-menu'
import { getLabelFromValue } from './search-dropdown-helpers'
import { LiteGroup } from 'common/group'
import { User } from 'common/user'

export function FilterPill(props: {
  selected: boolean
  onSelect: () => void
  className?: string
  children: ReactNode
  type: 'filter' | 'sort' | 'contractType' | 'spice'
}) {
  const { children, selected, onSelect, className, type } = props

  return (
    <button
      className={clsx(
        'flex h-6 cursor-pointer select-none flex-row items-center whitespace-nowrap rounded-full px-2 text-sm outline-none transition-colors',
        type === 'spice'
          ? selected
            ? 'bg-amber-500 text-white hover:bg-amber-600'
            : 'text-ink-600 hover:bg-sky-amber/30 bg-amber-500/10 dark:bg-amber-500/20 dark:hover:bg-amber-500/30'
          : type === 'filter'
          ? selected
            ? 'bg-sky-500 text-white hover:bg-sky-600'
            : 'text-ink-600 bg-sky-500/10 hover:bg-sky-500/30 dark:bg-sky-500/20 dark:hover:bg-sky-500/30'
          : type === 'sort'
          ? selected
            ? 'hover:bg-primary-600 focus-visible:bg-primary-600 bg-primary-500 text-white'
            : 'bg-primary-500/10 hover:bg-primary-500/30 text-ink-600 dark:bg-primary-500/20 dark:hover:bg-primary-500/30 '
          : selected
          ? 'bg-purple-500 text-white hover:bg-purple-600 focus-visible:bg-purple-600'
          : 'text-ink-600 bg-purple-500/10 hover:bg-purple-500/30 dark:bg-purple-500/20 dark:hover:bg-purple-500/30',
        className
      )}
      onClick={onSelect}
    >
      {children}
    </button>
  )
}

export function AdditionalFilterPill(props: {
  className?: string
  children: ReactNode
  type: 'filter' | 'sort' | 'contractType'
  onXClick: () => void
}) {
  const { children, className, type, onXClick } = props

  return (
    <Row
      className={clsx(
        'relative h-6 select-none items-center gap-1 whitespace-nowrap rounded-full pl-2 pr-1 text-sm outline-none transition-colors',
        type === 'filter'
          ? 'bg-sky-500 text-white'
          : type === 'sort'
          ? 'bg-primary-500 text-white'
          : 'bg-purple-500 text-white',
        className
      )}
    >
      {children}
      <button
        className="text-ink-200 dark:text-ink-800 cursor-pointer rounded-full transition-colors hover:text-white hover:dark:text-white"
        onClick={onXClick}
      >
        <XCircleIcon className="h-4 w-4 " />
      </button>
    </Row>
  )
}

export function TierDropdownPill(props: {
  toggleTier: (tier: MarketTierType) => void
  currentTiers: TierParamsType
}) {
  const { toggleTier, currentTiers } = props
  return (
    <CheckedDropdownMenu
      withinOverflowContainer
      items={[
        {
          name: 'Crystal',
          content: (
            <Row className="items-center text-sm">
              <CrystalTier />
              <div className="bg-gradient-to-r from-pink-700 to-pink-500 bg-clip-text text-transparent dark:from-pink-400 dark:to-pink-300">
                Crystal
              </div>
            </Row>
          ),
          onToggle: () => toggleTier('crystal'),
          checked: currentTiers[tiers.indexOf('crystal')] == '1',
        },
        {
          name: 'Premium',
          content: (
            <Row className="items-center text-sm text-purple-600 dark:text-purple-400">
              <PremiumTier />
              Premium
            </Row>
          ),
          onToggle: () => toggleTier('premium'),
          checked: currentTiers[tiers.indexOf('premium')] == '1',
        },
        {
          name: 'Plus',
          content: (
            <Row className="items-center text-sm font-semibold text-blue-600 dark:text-blue-500">
              <PlusTier />
              Plus
            </Row>
          ),
          onToggle: () => toggleTier('plus'),
          checked: currentTiers[tiers.indexOf('plus')] == '1',
        },
      ]}
      buttonContent={(open) => (
        <div
          className={clsx(
            'flex cursor-pointer select-none flex-row items-center whitespace-nowrap rounded-full py-0.5 pl-2 pr-0.5 text-sm outline-none transition-colors',
            currentTiers.includes('1')
              ? 'bg-sky-500 text-white hover:bg-sky-600'
              : 'text-ink-600 bg-sky-500/10 hover:bg-sky-500/30 dark:bg-sky-500/20 dark:hover:bg-sky-500/30'
          )}
        >
          Tier{' '}
          <ChevronDownIcon
            className={clsx(
              'h-4 w-4 transition-transform',
              open ? 'rotate-180' : ''
            )}
          />
        </div>
      )}
    />
  )
}

export function FilterDropdownPill(props: {
  selectFilter: (selection: Filter) => void
  currentFilter: Filter
}) {
  const { selectFilter, currentFilter } = props
  const currentFilterLabel = getLabelFromValue(FILTERS, currentFilter)
  return (
    <DropdownMenu
      withinOverflowContainer
      items={FILTERS.map((filter) => {
        return {
          name: filter.label,
          onClick: () => selectFilter(filter.value),
        }
      })}
      menuItemsClass={clsx()}
      buttonContent={(open) => (
        <div
          className={clsx(
            'flex cursor-pointer select-none flex-row items-center whitespace-nowrap rounded-full py-0.5 pl-2 pr-0.5 text-sm outline-none transition-colors',

            'text-ink-600 bg-sky-500/10 hover:bg-sky-500/30 dark:bg-sky-500/20 dark:hover:bg-sky-500/30'
          )}
        >
          {currentFilterLabel}
          <ChevronDownIcon
            className={clsx(
              'h-4 w-4 transition-transform',
              open ? 'rotate-180' : ''
            )}
          />
        </div>
      )}
      selectedItemName={currentFilterLabel}
      closeOnClick
    />
  )
}

export function TopicDropdownPill(props: {
  initialTopics: LiteGroup[]
  currentTopicFilter?: string
  user: User | null | undefined
  forYou: boolean
  updateParams: (params: Partial<SearchParams>) => void
}) {
  const { initialTopics, currentTopicFilter, user, forYou, updateParams } =
    props

  const currentTopicInInitialTopicsName = initialTopics.find(
    (topic) => topic.slug == currentTopicFilter
  )?.name
  const currentTopicLabel = forYou
    ? 'For You'
    : currentTopicInInitialTopicsName ?? 'All Topics'

  const selectTopicFilter = (selection: string) => {
    if (selection === currentTopicFilter) {
      return
    }

    updateParams({
      [TOPIC_FILTER_KEY]: selection,
      [FOR_YOU_KEY]: '0',
    })
  }

  const forYouItem = user
    ? {
        name: 'For You',
        onClick: () =>
          updateParams({
            [FOR_YOU_KEY]: '1',
          }),
      }
    : null

  const items = [
    ...(forYouItem ? [forYouItem] : []), // Include forYouItem only if it is not null
    {
      name: 'All Topics',
      onClick: () =>
        updateParams({
          [FOR_YOU_KEY]: '0',
          [TOPIC_FILTER_KEY]: '',
        }),
    },
    ...initialTopics.map((topic) => ({
      name: topic.name,
      onClick: () => selectTopicFilter(topic.slug),
    })),
  ]

  return (
    <DropdownMenu
      withinOverflowContainer
      items={items}
      buttonContent={(open) => (
        <div
          className={clsx(
            'flex cursor-pointer select-none flex-row items-center whitespace-nowrap rounded-full py-0.5 pl-2 pr-0.5 text-sm outline-none transition-colors',

            'text-ink-600 bg-sky-500/10 hover:bg-sky-500/30 dark:bg-sky-500/20 dark:hover:bg-sky-500/30'
          )}
        >
          {currentTopicLabel}
          <ChevronDownIcon
            className={clsx(
              'h-4 w-4 transition-transform',
              open ? 'rotate-180' : ''
            )}
          />
        </div>
      )}
      selectedItemName={currentTopicLabel}
      closeOnClick
      menuItemsClass="max-h-64 overflow-y-auto"
    />
  )
}
