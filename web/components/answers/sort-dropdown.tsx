import { ChevronDownIcon } from '@heroicons/react/solid'
import clsx from 'clsx'

import { Row } from '../layout/row'
import generateFilterDropdownItems from '../search/search-dropdown-helpers'
import DropdownMenu from '../widgets/dropdown-menu'
import { InfoTooltip } from '../widgets/info-tooltip'

// Pill dropdown for picking how a market's answers or a poll's options are ordered.
export function SortDropdown<T extends string>(props: {
  sorts: readonly { readonly label: string; readonly value: T }[]
  sort: T
  setSort: (sort: T) => void
}) {
  const { sorts, sort, setSort } = props
  return (
    <DropdownMenu
      closeOnClick
      items={generateFilterDropdownItems(sorts, setSort)}
      buttonContent={
        <Row className="text-ink-500 items-center gap-0.5">
          <span className="whitespace-nowrap text-sm font-medium">
            {sorts.find((s) => s.value === sort)?.label}
          </span>
          <ChevronDownIcon className="h-4 w-4" />
        </Row>
      }
      buttonClass={
        'h-8 rounded-full bg-ink-100 hover:bg-ink-200 text-ink-600 dark:bg-ink-300 dark:hover:bg-ink-400 py-1 text-sm px-3'
      }
    />
  )
}

// Lets the creator or a mod save the selected sort as the default for everyone.
export function SetDefaultSortButton(props: {
  sortLabel: string | undefined
  onClick: () => void
  className?: string
}) {
  const { sortLabel, onClick, className } = props
  return (
    <Row
      className={clsx(
        'text-primary-700 items-center gap-0.5 text-xs font-semibold',
        className
      )}
    >
      <button className="hover:underline" onClick={onClick}>
        Set default
      </button>
      <div className="mb-1 flex items-center">
        <InfoTooltip
          size="sm"
          text={`This sets the default sort order to ${sortLabel} for all users`}
          tooltipParams={{ placement: 'bottom' }}
        />
      </div>
    </Row>
  )
}
