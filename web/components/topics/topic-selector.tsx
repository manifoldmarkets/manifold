import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
  Label,
} from '@headlessui/react'
import {
  PlusCircleIcon,
  SearchIcon,
  ChevronDownIcon,
} from '@heroicons/react/outline'
import clsx from 'clsx'
import { Group, LiteGroup, MAX_GROUPS_PER_MARKET } from 'common/group'
import { useEffect, useRef, useState } from 'react'
import { CreateTopicModal } from 'web/components/topics/create-topic-modal'
import { Row } from 'web/components/layout/row'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { useUser } from 'web/hooks/use-user'
import { searchGroups } from 'web/lib/api/api'
import { PRIVACY_STATUS_ITEMS } from './topic-privacy-modal'
import { uniqBy } from 'lodash'
import { Col } from '../layout/col'
import { buildArray } from 'common/util/array'
import DropdownMenu from '../widgets/dropdown-menu'
import { DropdownPill } from '../search/filter-pills'

export function TopicSelector(props: {
  setSelectedGroup: (group: Group) => void
  max?: number
  label?: string
  selectedIds?: string[]
  onCreateTopic?: (group: Group) => void
  className?: string
  placeholder?: string
  addingToContract: boolean
}) {
  const {
    setSelectedGroup,
    max,
    label,
    onCreateTopic,
    selectedIds,
    className,
    placeholder,
    addingToContract,
  } = props
  const user = useUser()
  const [isCreatingNewGroup, setIsCreatingNewGroup] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  const { query, setQuery, searchedGroups, loading } =
    useSearchGroups(addingToContract)

  const handleSelectGroup = (group: Group | null | 'new') => {
    if (group === 'new') {
      setIsCreatingNewGroup(true)
      return
    }
    if (group) setSelectedGroup(group)
    setQuery('')
    setIsDropdownOpen(false)
  }

  const atMax = max != undefined && selectedIds && selectedIds.length >= max

  useEffect(() => {
    if (atMax) {
      setIsDropdownOpen(false)
    }
  }, [atMax])

  useEffect(() => {
    if (query.length > 0 && !atMax && !isDropdownOpen) {
      setIsDropdownOpen(true)
    }
  }, [query, atMax, isDropdownOpen])

  const filteredGroups = searchedGroups.filter(
    (group) => !selectedIds?.some((id) => id == group.id)
  )

  return (
    <Col className={clsx('w-full items-start', className)}>
      <Combobox
        as="div"
        value={null}
        onChange={handleSelectGroup}
        className={'w-full text-sm'}
        disabled={atMax}
        immediate
      >
        {label && (
          <Label className="justify-start gap-2 px-1 py-2 text-base">
            {label}{' '}
            <InfoTooltip text="Question will be displayed alongside the other questions in the category." />
          </Label>
        )}
        <div className="relative w-full">
          <SearchIcon
            className={clsx(
              'absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2',
              atMax ? 'text-ink-300' : 'text-ink-400'
            )}
          />
          <ComboboxInput
            className={clsx(
              'bg-canvas-0 w-full rounded-md border py-2.5 pl-9 pr-9 text-sm shadow-sm transition-colors focus:outline-none focus:ring-1',
              atMax
                ? 'border-ink-200 text-ink-400 cursor-not-allowed'
                : 'border-ink-300 placeholder-ink-400 hover:border-ink-400 focus:border-primary-500 focus:ring-primary-500'
            )}
            onChange={(e) => setQuery(e.target.value)}
            displayValue={(group: Group) => group && group.name}
            placeholder={
              atMax
                ? `Limit of ${MAX_GROUPS_PER_MARKET} topics reached`
                : placeholder ?? 'Search topics…'
            }
            onFocus={() => !atMax && setIsDropdownOpen(true)}
            onClick={() => !atMax && setIsDropdownOpen(true)}
            onBlur={() => {
              setTimeout(() => {
                setIsDropdownOpen(false)
              }, 200)
            }}
          />
          <ComboboxButton
            className="absolute inset-y-0 right-0 flex items-center px-2.5"
            onClick={() => {
              if (!atMax) {
                setIsDropdownOpen(!isDropdownOpen)
              }
            }}
          >
            <ChevronDownIcon
              className={clsx(
                'h-4 w-4 transition-transform',
                atMax ? 'text-ink-300' : 'text-ink-400',
                isDropdownOpen && !atMax && 'rotate-180'
              )}
              aria-hidden="true"
            />
          </ComboboxButton>

          {isDropdownOpen && !atMax && (
            <ComboboxOptions
              static={isCreatingNewGroup}
              className="bg-canvas-0 ring-ink-300 absolute z-10 mt-1 max-h-60 w-full overflow-x-hidden rounded-md py-1 shadow-lg ring-1 focus:outline-none"
            >
              {loading ? (
                <>
                  <LoadingOption className="w-3/4" />
                  <LoadingOption className="w-1/2" />
                  <LoadingOption className="w-3/4" />
                </>
              ) : filteredGroups.length === 0 && !user ? (
                <div className="text-ink-400 px-4 py-3 text-sm">
                  No topics found
                </div>
              ) : (
                filteredGroups.map((group: LiteGroup) => (
                  <ComboboxOption
                    key={group.id}
                    value={group}
                    className={({ active }) =>
                      clsx(
                        'relative flex cursor-pointer select-none items-center justify-between px-4 py-2.5 transition-colors',
                        active ? 'bg-primary-50 text-ink-1000' : 'text-ink-900'
                      )
                    }
                  >
                    <span className="truncate">{group.name}</span>
                    <Row className="items-center gap-2">
                      <span className="text-ink-400 text-xs">
                        {group.totalMembers} followers
                      </span>
                      {group.privacyStatus != 'public' && (
                        <span className="text-ink-400">
                          {PRIVACY_STATUS_ITEMS[group.privacyStatus].icon}
                        </span>
                      )}
                    </Row>
                  </ComboboxOption>
                ))
              )}

              {user && !loading && (
                <ComboboxOption
                  value={'new'}
                  className={clsx(
                    'border-ink-200 relative flex cursor-pointer select-none items-center border-t px-4 py-2.5 transition-colors',
                    'data-[focus]:bg-primary-50 data-[focus]:text-ink-1000 text-ink-700'
                  )}
                >
                  <Row className="items-center gap-2">
                    <PlusCircleIcon className="h-4 w-4 text-teal-500" />
                    <span className="text-sm">Create a new topic</span>
                  </Row>
                </ComboboxOption>
              )}
            </ComboboxOptions>
          )}
        </div>
      </Combobox>
      {isCreatingNewGroup && (
        <CreateTopicModal
          user={user}
          startingTitle={query}
          open={isCreatingNewGroup}
          setOpen={setIsCreatingNewGroup}
          onCreate={(group) => {
            handleSelectGroup(group)
            onCreateTopic?.(group)
            setIsCreatingNewGroup(false)
          }}
        />
      )}
    </Col>
  )
}

const LoadingOption = (props: { className: string }) => (
  <div className="flex w-full animate-pulse select-none items-center px-4 py-2.5">
    <div className={clsx('bg-ink-200 h-4 rounded-full', props.className)} />
  </div>
)

export const useSearchGroups = (addingToContract: boolean) => {
  const [query, setQuery] = useState('')
  const [searchedGroups, setSearchedGroups] = useState<LiteGroup[]>([])
  const [loading, setLoading] = useState(false)

  const requestNumber = useRef(0)

  useEffect(() => {
    requestNumber.current++
    const requestId = requestNumber.current
    setSearchedGroups([])
    setLoading(true)
    searchGroups({
      term: query,
      limit: 10,
      addingToContract,
      type: 'lite',
    }).then((result) => {
      if (requestNumber.current === requestId) {
        setSearchedGroups(uniqBy(result.lite, 'name'))
        setLoading(false)
      }
    })
  }, [query])

  return {
    query,
    setQuery,
    searchedGroups,
    setSearchedGroups,
    loading,
    setLoading,
  }
}

export function TopicPillSelector(props: {
  topic: LiteGroup | undefined
  setTopic: (topic: LiteGroup | undefined) => void
}) {
  const { topic, setTopic } = props
  const { query, setQuery, searchedGroups } = useSearchGroups(false)

  const currentName = topic?.name ?? 'All topics'

  return (
    <DropdownMenu
      closeOnClick
      selectedItemName={currentName}
      items={buildArray(
        {
          name: 'Search topics',
          nonButtonContent: (
            <div className="flex">
              <input
                type="text"
                className="bg-ink-200 dark:bg-ink-300 focus:ring-primary-500 mx-1 mb-1 w-full rounded-md border-none px-3 py-0.5 text-xs"
                placeholder="search"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          ),
        },
        {
          name: 'All topics',
          onClick: () => {
            setTopic(undefined)
          },
        },
        searchedGroups.map((topic) => ({
          name: topic.name,
          onClick: () => {
            setTopic(topic)
            setQuery('')
          },
        }))
      )}
      buttonContent={(open) => (
        <DropdownPill open={open}>{currentName}</DropdownPill>
      )}
    />
  )
}
