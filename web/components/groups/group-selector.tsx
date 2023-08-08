import { Combobox } from '@headlessui/react'
import { PlusCircleIcon, SelectorIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { Group } from 'common/group'
import { useEffect, useRef, useState } from 'react'
import { CreateGroupButton } from 'web/components/groups/create-group-button'
import { Row } from 'web/components/layout/row'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { useUser } from 'web/hooks/use-user'
import { searchGroups } from 'web/lib/supabase/groups'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { PRIVACY_STATUS_ITEMS } from './group-privacy-modal'
import { uniqBy } from 'lodash'

export function GroupSelector(props: {
  setSelectedGroup: (group: Group) => void
  isContractCreator: boolean
  showLabel: boolean
  ignoreGroupIds?: string[]
  newContract?: boolean
}) {
  const {
    setSelectedGroup,
    isContractCreator,
    showLabel,
    ignoreGroupIds,
    newContract,
  } = props
  const user = useUser()
  const [isCreatingNewGroup, setIsCreatingNewGroup] = useState(false)
  const [query, setQuery] = useState('')
  const [searchedGroups, setSearchedGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(false)

  const requestNumber = useRef(0)

  useEffect(() => {
    if (!user) return
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
        setSearchedGroups(uniqBy(result.data, 'name'))
        setLoading(false)
      }
    })
  }, [user?.id, isContractCreator, query])

  const handleSelectGroup = (group: Group | null) => {
    group && setSelectedGroup(group)
    setQuery('') // Clear the input
  }

  return (
    <div className="flex w-full flex-col items-start">
      <Combobox
        as="div"
        value={null}
        onChange={handleSelectGroup}
        nullable={true}
        className={'w-full text-sm'}
      >
        {() => (
          <>
            {showLabel && (
              <Combobox.Label className="justify-start gap-2 px-1 py-2 text-base">
                Add to Category{' '}
                <InfoTooltip text="Question will be displayed alongside the other questions in the category." />
              </Combobox.Label>
            )}
            <div className="relative mt-2 w-full">
              <Combobox.Input
                className="border-ink-300 bg-canvas-0 focus:border-primary-500 focus:ring-primary-500 w-full rounded-md border p-3 pl-4 pr-20 text-sm shadow-sm focus:outline-none focus:ring-1"
                onChange={(e) => setQuery(e.target.value)}
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
                {loading ? (
                  <LoadingIndicator />
                ) : (
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
                        {({}) => (
                          <>
                            <span
                              className={clsx(
                                'ml-3 mt-1 flex flex-row justify-between'
                              )}
                            >
                              <Row
                                className={'items-center gap-1 truncate pl-5'}
                              >
                                {group.name}
                              </Row>
                              <Row
                                className={clsx(
                                  'text-ink-500 items-center gap-2 text-sm',
                                  'text-ink-500'
                                )}
                              >
                                {group.privacyStatus != 'public' &&
                                  PRIVACY_STATUS_ITEMS[group.privacyStatus]
                                    .icon}
                              </Row>
                            </span>
                          </>
                        )}
                      </Combobox.Option>
                    ))
                )}

                {user && (
                  <CreateGroupButton
                    user={user}
                    onOpenStateChange={setIsCreatingNewGroup}
                    className={
                      'text-ink-900 bg-canvas-0 hover:text-ink-0 hover:bg-primary-500 group flex w-full flex-row items-center rounded-none border-0 font-normal transition-colors'
                    }
                    label={'Create a new Category'}
                    addGroupIdParamOnSubmit
                    icon={
                      <PlusCircleIcon className="mr-2 h-5 w-5 text-teal-500 group-hover:text-teal-300" />
                    }
                    openModalBtnColor="gray-white"
                  />
                )}
              </Combobox.Options>
            </div>
          </>
        )}
      </Combobox>
    </div>
  )
}
