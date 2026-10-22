import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react'
import {
  AdjustmentsIcon,
  CheckIcon,
  ViewGridIcon,
  ViewListIcon,
} from '@heroicons/react/outline'
import { ChevronDownIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { APIParams } from 'common/api/schema'
import { SEARCH_TOPICS_TO_SUBTOPICS } from 'common/topics'
import { removeEmojis } from 'common/util/string'
import { ReactNode } from 'react'

type Params = APIParams<'search-markets-full'>
export type Sort = NonNullable<Params['sort']>
export type Filter = NonNullable<Params['filter']>
export type ContractType = NonNullable<Params['contractType']>
export type BrowseLayout = 'cards' | 'list'

// Sorts on screen follow what people picked on the old page: Hot, New and
// Best were used far more than any other sort, so the rest live under More.
// Daily change was rarely picked; the Moving today strip covers it instead.
export type Lens = 'for-you' | 'best' | 'hot' | 'new' | MoreSort
type MoreSort =
  | 'most-popular'
  | 'liquidity'
  | 'close-date'
  | '24-hour-vol'
  | 'daily-score'
  | 'random'

export const MAIN_LENSES: {
  key: Lens
  label: string
  sort: Sort
  signedInOnly?: boolean
}[] = [
  { key: 'for-you', label: 'For you', sort: 'score', signedInOnly: true },
  { key: 'best', label: 'Best', sort: 'score' },
  { key: 'hot', label: 'Hot', sort: 'freshness-score' },
  { key: 'new', label: 'New', sort: 'newest' },
]

// Roughly ordered by how often each was picked on the old page.
export const MORE_SORTS: { key: MoreSort; label: string }[] = [
  { key: 'most-popular', label: 'Most traders' },
  { key: 'liquidity', label: 'Most liquidity' },
  { key: 'close-date', label: 'Closing soonest' },
  { key: '24-hour-vol', label: '24h volume' },
  { key: 'random', label: 'Random' },
  { key: 'daily-score', label: 'Biggest daily move' },
]

export const sortForLens = (lens: Lens): Sort =>
  MAIN_LENSES.find((l) => l.key === lens)?.sort ?? (lens as MoreSort)

// Status options, ordered by how often each was picked on the old page.
export const STATUSES: { key: Filter; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'closing-week', label: 'Closing this week' },
  { key: 'closing-month', label: 'Closing this month' },
  { key: 'closing-90-days', label: 'Closing in 90 days' },
  { key: 'all', label: 'Any status' },
  { key: 'closed', label: 'Closed' },
  { key: 'resolved', label: 'Resolved' },
]

// Minimum liquidity was picked more often than any market type.
export const LIQUIDITY_TIERS: { key: number | undefined; label: string }[] = [
  { key: undefined, label: 'Any' },
  { key: 1000, label: 'Ṁ1k+' },
  { key: 10000, label: 'Ṁ10k+' },
  { key: 100000, label: 'Ṁ100k+' },
]

export const CONTRACT_TYPES: { key: ContractType; label: string }[] = [
  { key: 'ALL', label: 'Any' },
  { key: 'BINARY', label: 'Yes/No' },
  { key: 'MULTIPLE_CHOICE', label: 'Multiple choice' },
  { key: 'PERP', label: 'Perps' },
  { key: 'POLL', label: 'Polls' },
]

export type BrowseFilters = {
  status: Filter
  liquidity: number | undefined
  contractType: ContractType
  // Perps and small house sports/race markets are folded into their hubs
  // unless this is on (see hub-fold.ts).
  showHubMarkets?: boolean
}
export const DEFAULT_FILTERS: BrowseFilters = {
  status: 'open',
  liquidity: undefined,
  contractType: 'ALL',
  showHubMarkets: false,
}

const HUB_MARKET_OPTIONS = [
  { key: false, label: 'In their hubs' },
  { key: true, label: 'Show in this list' },
]

// Many people follow dozens of topics; the menu shows the first dozen and
// links to the full list.
const MAX_FOLLOWED_IN_MENU = 12

export type TopicChoice = {
  key: string
  label: string
  gids?: string
  topicSlug?: string
}
export const ALL_TOPICS: TopicChoice = { key: 'all', label: 'All topics' }
export const FOLLOWED_TOPICS: TopicChoice = {
  key: 'followed',
  label: 'Followed topics',
  topicSlug: 'followed',
}
export const CATEGORY_TOPICS: TopicChoice[] = Object.entries(
  SEARCH_TOPICS_TO_SUBTOPICS
).map(([name, subtopics]) => ({
  key: `cat:${removeEmojis(name).trim()}`,
  label: removeEmojis(name).trim(),
  gids: subtopics.flatMap((s) => s.groupIds).join(','),
}))

export function LensBar(props: {
  lens: Lens
  onLens: (lens: Lens) => void
  signedIn: boolean
  topic: TopicChoice
  followedTopics: TopicChoice[]
  onTopic: (topic: TopicChoice) => void
  filters: BrowseFilters
  onFilters: (filters: BrowseFilters) => void
  layout: BrowseLayout
  onLayout: (layout: BrowseLayout) => void
  onYourTopics: () => void
  searching: boolean
}) {
  const {
    lens,
    onLens,
    signedIn,
    topic,
    followedTopics,
    onTopic,
    filters,
    onFilters,
    layout,
    onLayout,
    onYourTopics,
    searching,
  } = props
  const lenses = MAIN_LENSES.filter((l) => signedIn || !l.signedInOnly)
  const moreActive = MORE_SORTS.find((s) => s.key === lens)

  return (
    // One row at every width. On narrow screens it scrolls sideways (with a
    // fade at the edge) instead of wrapping into a second sticky row; the
    // layout toggle stays pinned on the right.
    <div className="flex items-center gap-2">
      <div className="-mx-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1 [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)] [scrollbar-width:none] lg:[mask-image:none]">
        <div
          role="tablist"
          aria-label="Sort markets"
          className={clsx(
            'flex shrink-0 items-center gap-1',
            searching && 'opacity-50'
          )}
        >
          {lenses.map((l) => {
            const selected = l.key === lens && !searching
            return (
              <button
                key={l.key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onLens(l.key)}
                className={clsx(
                  'shrink-0 whitespace-nowrap rounded-full px-2.5 py-1.5 text-sm font-medium transition-colors sm:px-3',
                  selected
                    ? 'bg-ink-900 text-canvas-0'
                    : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900'
                )}
              >
                {l.label}
              </button>
            )
          })}
          <MenuPopover
            label={
              <span
                className={clsx(
                  'flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1.5 text-sm font-medium transition-colors sm:px-3',
                  moreActive && !searching
                    ? 'bg-ink-900 text-canvas-0'
                    : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900'
                )}
              >
                {moreActive ? moreActive.label : 'More'}
                <ChevronDownIcon className="h-4 w-4" />
              </span>
            }
            panelClass="w-56 p-1"
          >
            {(close) =>
              MORE_SORTS.map((s) => (
                <MenuOption
                  key={s.key}
                  selected={s.key === lens}
                  onClick={() => {
                    onLens(s.key)
                    close()
                  }}
                >
                  {s.label}
                </MenuOption>
              ))
            }
          </MenuPopover>
        </div>

        <span className="bg-ink-200 mx-0.5 h-5 w-px shrink-0 lg:hidden" />
        <div className="flex shrink-0 items-center gap-2 lg:ml-auto">
          <MenuPopover
            label={<Pill active={topic.key !== 'all'}>{topic.label}</Pill>}
            panelClass="w-64 max-h-[60vh] overflow-y-auto p-1"
          >
            {(close) => (
              <>
                {[ALL_TOPICS, ...(signedIn ? [FOLLOWED_TOPICS] : [])].map(
                  (t) => (
                    <MenuOption
                      key={t.key}
                      selected={t.key === topic.key}
                      onClick={() => {
                        onTopic(t)
                        close()
                      }}
                    >
                      {t.label}
                    </MenuOption>
                  )
                )}
                {followedTopics.length > 0 && (
                  <MenuHeading>Topics you follow</MenuHeading>
                )}
                {followedTopics.slice(0, MAX_FOLLOWED_IN_MENU).map((t) => (
                  <MenuOption
                    key={t.key}
                    selected={t.key === topic.key}
                    onClick={() => {
                      onTopic(t)
                      close()
                    }}
                  >
                    {t.label}
                  </MenuOption>
                ))}
                {followedTopics.length > MAX_FOLLOWED_IN_MENU && (
                  <MenuOption
                    selected={false}
                    onClick={() => {
                      close()
                      onYourTopics()
                    }}
                  >
                    <span className="text-ink-500">
                      All {followedTopics.length} followed topics…
                    </span>
                  </MenuOption>
                )}
                <MenuHeading>Categories</MenuHeading>
                {CATEGORY_TOPICS.map((t) => (
                  <MenuOption
                    key={t.key}
                    selected={t.key === topic.key}
                    onClick={() => {
                      onTopic(t)
                      close()
                    }}
                  >
                    {t.label}
                  </MenuOption>
                ))}
                <div className="border-ink-200 mt-1 border-t pt-1">
                  <MenuOption
                    selected={false}
                    onClick={() => {
                      close()
                      onYourTopics()
                    }}
                  >
                    <span className="text-primary-700">
                      Follow or hide topics…
                    </span>
                  </MenuOption>
                </div>
              </>
            )}
          </MenuPopover>

          <FiltersPopover filters={filters} onFilters={onFilters} />

          {/* On narrow screens this lives in the topic menu instead: as a
            bare icon it read as another filter. */}
          <button
            type="button"
            onClick={onYourTopics}
            className="border-ink-300 text-ink-700 hover:border-ink-400 hidden shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium lg:flex"
            title="Review the topics you follow and hide"
          >
            <AdjustmentsIcon className="h-4 w-4" />
            Your topics
          </button>
          <div
            className="border-ink-200 hidden shrink-0 rounded-lg border p-0.5 sm:flex"
            role="group"
            aria-label="Market layout"
          >
            {(
              [
                { value: 'cards', label: 'Card view', Icon: ViewGridIcon },
                { value: 'list', label: 'List view', Icon: ViewListIcon },
              ] as const
            ).map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                aria-label={label}
                title={label}
                aria-pressed={layout === value}
                onClick={() => onLayout(value)}
                className={clsx(
                  'flex h-8 w-8 items-center justify-center rounded-md',
                  layout === value
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-ink-400 hover:bg-canvas-100'
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function FiltersPopover(props: {
  filters: BrowseFilters
  onFilters: (filters: BrowseFilters) => void
}) {
  const { filters, onFilters } = props
  const active =
    (filters.status !== DEFAULT_FILTERS.status ? 1 : 0) +
    (filters.liquidity !== undefined ? 1 : 0) +
    (filters.contractType !== 'ALL' ? 1 : 0) +
    (filters.showHubMarkets ? 1 : 0)
  const statusLabel =
    STATUSES.find((s) => s.key === filters.status)?.label ?? 'Open'
  return (
    <MenuPopover
      label={
        <Pill active={active > 0}>
          {active === 1 && filters.status !== DEFAULT_FILTERS.status
            ? statusLabel
            : active > 0
            ? `Filters · ${active}`
            : statusLabel}
        </Pill>
      }
      panelClass="w-80 p-3"
    >
      {() => (
        <div className="flex flex-col gap-3">
          <ChipGroup
            title="Status"
            options={STATUSES}
            value={filters.status}
            onChange={(status) => onFilters({ ...filters, status })}
          />
          <ChipGroup
            title="Minimum liquidity"
            options={LIQUIDITY_TIERS}
            value={filters.liquidity}
            onChange={(liquidity) => onFilters({ ...filters, liquidity })}
          />
          <ChipGroup
            title="Market type"
            options={CONTRACT_TYPES}
            value={filters.contractType}
            onChange={(contractType) => onFilters({ ...filters, contractType })}
          />
          <ChipGroup
            title="Perps, sports and race markets"
            options={HUB_MARKET_OPTIONS}
            value={!!filters.showHubMarkets}
            onChange={(showHubMarkets) =>
              onFilters({ ...filters, showHubMarkets })
            }
          />
          {active > 0 && (
            <button
              type="button"
              onClick={() => onFilters(DEFAULT_FILTERS)}
              className="text-primary-700 self-start text-sm font-medium"
            >
              Reset filters
            </button>
          )}
        </div>
      )}
    </MenuPopover>
  )
}

function ChipGroup<T>(props: {
  title: string
  options: { key: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  const { title, options, value, onChange } = props
  return (
    <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
      <legend className="text-ink-500 mb-1.5 text-xs font-medium uppercase tracking-wide">
        {title}
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={String(o.key)}
            type="button"
            aria-pressed={o.key === value}
            onClick={() => onChange(o.key)}
            className={clsx(
              'rounded-full px-2.5 py-1 text-sm transition-colors',
              o.key === value
                ? 'bg-primary-100 text-primary-800 font-medium'
                : 'bg-ink-100 text-ink-700 hover:bg-ink-200'
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function MenuPopover(props: {
  label: ReactNode
  panelClass?: string
  children: (close: () => void) => ReactNode
}) {
  const { label, panelClass, children } = props
  return (
    <Popover className="relative shrink-0">
      {({ close }) => (
        <>
          <PopoverButton className="focus-visible:ring-primary-500 rounded-full outline-none focus-visible:ring-2">
            {label}
          </PopoverButton>
          <PopoverPanel
            anchor={{ to: 'bottom start', gap: 6, padding: 8 }}
            className={clsx(
              'bg-canvas-0 border-ink-200 z-50 rounded-lg border shadow-lg',
              panelClass
            )}
          >
            {children(close)}
          </PopoverPanel>
        </>
      )}
    </Popover>
  )
}

function MenuHeading(props: { children: ReactNode }) {
  return (
    <div className="text-ink-500 px-2 pb-1 pt-2 text-xs font-medium uppercase tracking-wide">
      {props.children}
    </div>
  )
}

function MenuOption(props: {
  selected: boolean
  onClick: () => void
  children: ReactNode
}) {
  const { selected, onClick, children } = props
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'hover:bg-ink-100 flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm',
        selected ? 'text-ink-1000 font-medium' : 'text-ink-700'
      )}
    >
      <span className="truncate">{children}</span>
      {selected && <CheckIcon className="text-primary-600 h-4 w-4 shrink-0" />}
    </button>
  )
}

function Pill(props: { active: boolean; children: ReactNode }) {
  const { active, children } = props
  return (
    <span
      className={clsx(
        'flex items-center gap-1 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium',
        active
          ? 'border-primary-400 bg-primary-50 text-primary-700'
          : 'border-ink-300 text-ink-700 hover:border-ink-400'
      )}
    >
      <span className="max-w-[9rem] truncate">{children}</span>
      <ChevronDownIcon className="h-4 w-4 shrink-0" />
    </span>
  )
}
