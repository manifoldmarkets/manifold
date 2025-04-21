import { ChevronDownIcon, XCircleIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { ReactNode } from 'react'

import { Row } from '../layout/row'
import {
  FILTERS,
  FOR_YOU_KEY,
  Filter,
  SearchParams,
  TOPIC_FILTER_KEY,
} from '../search'
import DropdownMenu from '../widgets/dropdown-menu'
import { getLabelFromValue } from './search-dropdown-helpers'
import { LiteGroup } from 'common/group'
import { User } from 'common/user'

export const minimalistIndigoSelectedClass =
  'bg-indigo-200 hover:bg-indigo-400 text-ink-600 dark:text-ink-800 dark:bg-indigo-900 dark:hover:bg-indigo-500'
export const unselectedClass =
  'bg-ink-100 hover:bg-indigo-300 text-ink-600 dark:bg-ink-300 dark:hover:bg-indigo-800'

export function FilterPill(props: {
  selected: boolean
  color?: 'gray' | 'minimalist-indigo'
  onSelect: () => void
  className?: string
  children: ReactNode
  type?: 'spice' | 'sweepies'
}) {
  const { children, selected, onSelect, className, type, color } = props

  return (
    <button
      className={clsx(
        'flex shrink-0 cursor-pointer select-none flex-row items-center whitespace-nowrap rounded-full px-3 py-0.5 text-sm outline-none transition-colors',
        type === 'spice'
          ? selected
            ? 'bg-amber-500 text-white hover:bg-amber-600'
            : 'text-ink-600 bg-amber-500/10 hover:bg-amber-500/30 dark:bg-amber-500/20 dark:hover:bg-amber-500/30'
          : type === 'sweepies'
          ? selected
            ? 'bg-amber-600 text-white hover:bg-amber-600'
            : 'text-ink-600 bg-amber-500/10 hover:bg-amber-500/30 dark:bg-amber-500/20 dark:hover:bg-amber-500/30'
          : color === 'gray' && selected
          ? 'bg-ink-300 hover:bg-ink-400 text-ink-600 dark:text-ink-800 dark:bg-ink-500 dark:hover:bg-ink-500'
          : color === 'minimalist-indigo' && selected
          ? minimalistIndigoSelectedClass
          : selected
          ? 'hover:bg-primary-600 focus-visible:bg-primary-600 bg-primary-500 text-white'
          : unselectedClass,
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
  onXClick: () => void
}) {
  const { children, className, onXClick } = props

  return (
    <Row
      className={clsx(
        'relative select-none items-center gap-1 whitespace-nowrap rounded-full py-0.5 pl-2 pr-1 text-sm outline-none transition-colors',
        'bg-primary-500 text-white',
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

export function FilterDropdownPill(props: {
  selectFilter: (selection: Filter) => void
  currentFilter: Filter
}) {
  const { selectFilter, currentFilter } = props
  // Remove the closing-month filter from the list while it's in its own button
  const currentFilterLabel =
    // currentFilter === 'closing-month' ? getLabelFromValue(FILTERS, 'open') :
    getLabelFromValue(FILTERS, currentFilter)

  return (
    <DropdownMenu
      withinOverflowContainer
      items={FILTERS.map((filter) => {
        return {
          name: filter.label,
          onClick: () => selectFilter(filter.value),
        }
      })}
      buttonContent={(open) => (
        <DropdownPill color={'light-gray'} open={open}>
          {currentFilterLabel}
        </DropdownPill>
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
    ? 'Your topics'
    : currentTopicInInitialTopicsName ?? 'All topics'

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
        name: 'Your topics',
        onClick: () =>
          updateParams({
            [FOR_YOU_KEY]: '1',
            [TOPIC_FILTER_KEY]: '',
          }),
      }
    : null

  const items = [
    ...(forYouItem ? [forYouItem] : []), // Include forYouItem only if it is not null
    {
      name: 'All topics',
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
        <DropdownPill color={'indigo'} open={open}>
          {currentTopicLabel}
        </DropdownPill>
      )}
      selectedItemName={currentTopicLabel}
      closeOnClick
      menuItemsClass="max-h-64 overflow-y-auto"
    />
  )
}

export function DropdownPill(props: {
  color?: 'indigo' | 'gray' | 'light-gray'
  open: boolean
  children: ReactNode
  onClick?: () => void
  className?: string
}) {
  const color = props.color ?? 'gray'

  return (
    <div
      className={clsx(
        'flex cursor-pointer select-none flex-row items-center whitespace-nowrap rounded-full py-0.5 pl-3 pr-1 text-sm outline-none transition-colors',
        color === 'indigo'
          ? 'hover:bg-primary-600 focus-visible:bg-primary-600 bg-primary-500 text-white'
          : color === 'light-gray'
          ? 'bg-ink-100 hover:bg-ink-200 text-ink-600 dark:bg-ink-300 dark:hover:bg-ink-400'
          : 'bg-ink-200 hover:bg-ink-300 text-ink-600 dark:bg-ink-300 dark:hover:bg-ink-400',
        props.className
      )}
      onClick={props.onClick}
    >
      {/* eslint-disable react/prop-types */}
      {props.children}
      <ChevronDownIcon
        className={clsx(
          'h-4 w-4 transition-transform',
          props.open ? 'rotate-180' : ''
        )}
      />
    </div>
  )
}
