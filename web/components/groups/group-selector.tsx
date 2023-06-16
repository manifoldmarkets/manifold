import { Combobox } from '@headlessui/react'
import {
  CheckIcon,
  PlusCircleIcon,
  SelectorIcon,
} from '@heroicons/react/outline'
import { UsersIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { Group } from 'common/group'
import { useEffect, useRef, useState } from 'react'
import { CreateGroupButton } from 'web/components/groups/create-group-button'
import { Row } from 'web/components/layout/row'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { useUser } from 'web/hooks/use-user'
import { searchGroups } from 'web/lib/supabase/groups'
import { LoadingIndicator } from '../widgets/loading-indicator'

export function GroupSelector(props: {
  selectedGroup: Group | undefined
  setSelectedGroup: (group: Group) => void
  isContractCreator: boolean
  options: {
    showSelector: boolean
    showLabel: boolean
    ignoreGroupIds?: string[]
  }
  newContract?: boolean
}) {
  const {
    selectedGroup,
    setSelectedGroup,
    isContractCreator,
    options,
    newContract,
  } = props
  const user = useUser()
  const [isCreatingNewGroup, setIsCreatingNewGroup] = useState(false)
  const { showSelector, showLabel, ignoreGroupIds } = options
  const [query, setQuery] = useState('')
  const [searchedGroups, setSearchedGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(false)

  const requestNumber = useRef(0)

  useEffect(() => {
    if (user) {
      requestNumber.current++
      const requestId = requestNumber.current
      setLoading(true)
      setSearchedGroups([])
      searchGroups({
        term: query,
        limit: 10,
        addingToContract: true,
        newContract,
      }).then((result) => {
        if (requestNumber.current === requestId) {
          setSearchedGroups(result.data as Group[])
          setLoading(false)
        }
      })
    }
  }, [user?.id, isContractCreator, query])

  if (!showSelector || !user) {
    return (
      <>
        <div className={'label justify-start'}>
          In Group:
          {selectedGroup ? (
            <span className=" text-primary-600 ml-1.5">
              {selectedGroup?.name}
            </span>
          ) : (
            <span className=" text-ink-600 ml-1.5 text-sm">(None)</span>
          )}
        </div>
      </>
    )
  }
  return (
    <div className="flex w-full flex-col items-start">
      <Combobox
        as="div"
        value={selectedGroup}
        onChange={setSelectedGroup}
        nullable={true}
        className={'w-full text-sm'}
      >
        {() => (
          <>
            {showLabel && (
              <Combobox.Label className="justify-start gap-2 px-1 py-2 text-base">
                Add to Group{' '}
                <InfoTooltip text="Question will be displayed alongside the other questions in the group." />
              </Combobox.Label>
            )}
            <div className="relative mt-2 w-full">
              <Combobox.Input
                className="border-ink-300 bg-canvas-0 focus:border-primary-500 focus:ring-primary-500 w-full rounded-md border p-3 pl-4 pr-20 text-sm shadow-sm focus:outline-none focus:ring-1"
                onChange={(event) => setQuery(event.target.value)}
                displayValue={(group: Group) => group && group.name}
                placeholder={'E.g. Science, Politics'}
              />
              <Combobox.Button className="absolute inset-y-0 right-0 flex items-center rounded-r-md px-2 focus:outline-none">
                <SelectorIcon
                  className="text-ink-400 h-5 w-5"
                  aria-hidden="true"
                />
              </Combobox.Button>

              <Combobox.Options
                static={isCreatingNewGroup}
                className="bg-canvas-0 ring-ink-1000 absolute z-10 mt-1 max-h-60 w-full overflow-x-hidden rounded-md py-1 shadow-lg ring-1 ring-opacity-5 focus:outline-none"
              >
                {loading && <LoadingIndicator />}
                {!loading &&
                  searchedGroups
                    .filter(
                      (group: Group) =>
                        !ignoreGroupIds?.some((id) => id == group.id)
                    )
                    .map((group: Group) => (
                      <Combobox.Option
                        key={group.id}
                        value={group}
                        className={({ active }) =>
                          clsx(
                            'relative h-12 cursor-pointer select-none py-2 pr-6 transition-colors',
                            active
                              ? 'text-ink-0 bg-primary-500'
                              : 'text-ink-900',
                            loading ? 'animate-pulse' : ''
                          )
                        }
                      >
                        {({ active, selected }) => (
                          <>
                            {selected && (
                              <span
                                className={clsx(
                                  'absolute inset-y-0 left-2 flex items-center pr-4',
                                  active ? 'text-ink-1000' : 'text-primary-600'
                                )}
                              >
                                <CheckIcon
                                  className="h-5 w-5"
                                  aria-hidden="true"
                                />
                              </span>
                            )}
                            <span
                              className={clsx(
                                'ml-3 mt-1 flex flex-row justify-between',
                                selected && 'font-semibold'
                              )}
                            >
                              <Row
                                className={'items-center gap-1 truncate pl-5'}
                              >
                                {group.name}
                              </Row>
                              <Row
                                className={clsx(
                                  'text-ink-500 gap-2 text-sm',
                                  active ? 'text-ink-1000' : 'text-ink-500'
                                )}
                              >
                                <Row className="w-12 items-center gap-0.5">
                                  <UsersIcon className="h-4 w-4" />
                                  {group.totalMembers}
                                </Row>
                              </Row>
                            </span>
                          </>
                        )}
                      </Combobox.Option>
                    ))}

                <CreateGroupButton
                  user={user}
                  onOpenStateChange={setIsCreatingNewGroup}
                  className={
                    'text-ink-900 bg-canvas-0 hover:text-ink-0 hover:bg-primary-500 group flex w-full flex-row items-center rounded-none border-0 font-normal transition-colors'
                  }
                  label={'Create a new Group'}
                  addGroupIdParamOnSubmit
                  icon={
                    <PlusCircleIcon className="mr-2 h-5 w-5 text-teal-500 group-hover:text-teal-300" />
                  }
                  openModalBtnColor="gray-white"
                />
              </Combobox.Options>
            </div>
          </>
        )}
      </Combobox>
    </div>
  )
}
