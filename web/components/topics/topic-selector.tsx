import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
  Label,
} from '@headlessui/react'
import { PlusCircleIcon, SelectorIcon } from '@heroicons/react/outline'
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
import { CheckIcon } from '@heroicons/react/solid'
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
    setQuery('') // Clear the input
    setIsDropdownOpen(false) // Close dropdown on selection
  }

  const atMax = max != undefined && selectedIds && selectedIds.length >= max

  // Force close dropdown when disabled
  useEffect(() => {
    if (atMax) {
      setIsDropdownOpen(false)
    }
  }, [atMax])

  // Open dropdown when typing
  useEffect(() => {
    if (query.length > 0 && !atMax && !isDropdownOpen) {
      setIsDropdownOpen(true)
    }
  }, [query, atMax, isDropdownOpen])

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
          <ComboboxInput
            className="border-ink-300 disabled:border-ink-100 bg-canvas-0 focus:border-primary-500 focus:ring-primary-500 w-full rounded-md border p-3 pl-4  text-sm shadow-sm focus:outline-none focus:ring-1"
            onChange={(e) => setQuery(e.target.value)}
            displayValue={(group: Group) => group && group.name}
            placeholder={
              atMax
                ? `You're at ${MAX_GROUPS_PER_MARKET} tags. Remove tags to add more.`
                : placeholder ?? 'Search topics'
            }
            onFocus={() => !atMax && setIsDropdownOpen(true)}
            onClick={() => !atMax && setIsDropdownOpen(true)}
            onBlur={(e) => {
              // Only close if we're not clicking within the dropdown
              // This timeout gives time for click events to register on options
              setTimeout(() => {
                setIsDropdownOpen(false)
              }, 200)
            }}
          />
          <ComboboxButton
            className="absolute inset-y-0 right-0 flex items-center rounded-r-md px-2 focus:outline-none"
            onClick={(e) => {
              if (!atMax) {
                setIsDropdownOpen(!isDropdownOpen)
              }
            }}
          >
            <SelectorIcon className="text-ink-400 h-5 w-5" aria-hidden="true" />
          </ComboboxButton>

          {isDropdownOpen && !atMax && (
            <ComboboxOptions
              static={isCreatingNewGroup}
              className="bg-canvas-0 ring-ink-1000 absolute z-10 mt-1 max-h-60 w-full overflow-x-hidden rounded-md py-1 shadow-lg ring-1 ring-opacity-5 focus:outline-none"
            >
              {loading ? (
                <>
                  <LoadingOption className={'w-3/4'} />
                  <LoadingOption className={'w-1/2'} />
                  <LoadingOption className={'w-3/4'} />
                </>
              ) : (
                searchedGroups
                  .filter((group) => !selectedIds?.some((id) => id == group.id))
                  .map((group: LiteGroup) => (
                    <ComboboxOption
                      key={group.id}
                      value={group}
                      className={({ active }) =>
                        clsx(
                          'relative flex h-12 cursor-pointer select-none items-center justify-between px-6 py-2 transition-colors',
                          active
                            ? 'bg-primary-200 text-ink-1000'
                            : 'text-ink-900'
                        )
                      }
                    >
                      <div className={'truncate'}>
                        {group.name} ({group.totalMembers} followers)
                      </div>
                      {group.privacyStatus != 'public' && (
                        <Row className={'text-ink-500'}>
                          {PRIVACY_STATUS_ITEMS[group.privacyStatus].icon}
                        </Row>
                      )}
                    </ComboboxOption>
                  ))
              )}

              {user && !loading && (
                <ComboboxOption
                  value={'new'}
                  className={clsx(
                    'relative flex h-12 cursor-pointer select-none items-center justify-between px-6 py-2 transition-colors',
                    'data-[focus]:bg-primary-200 data-[focus]:text-ink-1000 text-ink-900',
                    loading ? 'animate-pulse' : ''
                  )}
                >
                  <Row className={'items-center gap-1 truncate'}>
                    <PlusCircleIcon className="mr-2 h-5 w-5 text-teal-500" />
                    Create a new topic
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
  <div className="flex h-12 w-full animate-pulse select-none items-center px-6">
    <div className={clsx('bg-ink-300 h-4 rounded-full', props.className)} />
  </div>
)

const useSearchGroups = (addingToContract: boolean) => {
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

export function MultiTopicPillSelector(props: {
  topics: LiteGroup[]
  setTopics: (topics: LiteGroup[]) => void
  maxTopics?: number
  highlight?: boolean
  buttonClassName?: string
}) {
  const {
    topics,
    setTopics,
    maxTopics = 10,
    highlight = false,
    buttonClassName,
  } = props
  const { query, setQuery, searchedGroups } = useSearchGroups(false)

  const toggleTopic = (topic: LiteGroup) => {
    const isSelected = topics.some((t) => t.id === topic.id)
    if (isSelected) {
      setTopics(topics.filter((t) => t.id !== topic.id))
    } else if (topics.length < maxTopics) {
      setTopics([...topics, topic])
    }
  }

  return (
    <div className="relative">
      <DropdownMenu
        closeOnClick={false}
        selectedItemName={
          topics.length === 0
            ? 'All topics'
            : `${topics.length} topics selected`
        }
        items={[
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
              setTopics([])
            },
          },
          ...topics.map((topic) => ({
            name: topic.name,
            icon: <CheckIcon className="mr-1 h-4 w-4" />,
            onClick: () => toggleTopic(topic),
          })),
          ...searchedGroups
            .filter((topic) => !topics.some((t) => t.id === topic.id))
            .map((topic) => ({
              name: topic.name,
              onClick: () => toggleTopic(topic),
            })),
        ]}
        buttonContent={(open) => (
          <DropdownPill
            className={buttonClassName}
            open={open}
            color={highlight ? 'indigo' : 'gray'}
          >
            {topics.length === 0 ? 'All Topics' : `${topics.length} Topics`}
          </DropdownPill>
        )}
      />
    </div>
  )
}
