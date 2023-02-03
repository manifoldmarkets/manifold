import { Combobox } from '@headlessui/react'
import {
  CheckIcon,
  PlusCircleIcon,
  SelectorIcon,
} from '@heroicons/react/outline'
import { UsersIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { Group } from 'common/group'
import { User } from 'common/user'
import { searchInAny } from 'common/util/parse'
import { useState } from 'react'
import { CreateGroupButton } from 'web/components/groups/create-group-button'
import { Row } from 'web/components/layout/row'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { useMemberGroups, useOpenGroups } from 'web/hooks/use-group'

export function GroupSelector(props: {
  selectedGroup: Group | undefined
  setSelectedGroup: (group: Group) => void
  creator: User | null | undefined
  options: {
    showSelector: boolean
    showLabel: boolean
    ignoreGroupIds?: string[]
  }
  permittedGroups?: Group[]
}) {
  const { selectedGroup, setSelectedGroup, creator, options, permittedGroups } =
    props
  const [isCreatingNewGroup, setIsCreatingNewGroup] = useState(false)
  const { showSelector, showLabel, ignoreGroupIds } = options
  const [query, setQuery] = useState('')
  const openGroups = useOpenGroups()
  const memberGroups = useMemberGroups(creator?.id)
  const memberGroupIds = memberGroups?.map((g) => g.id) ?? []

  const sortGroups = (groups: Group[]) =>
    groups.sort((a, b) => b.totalMembers - a.totalMembers)

  let availableGroups
  if (permittedGroups) {
    availableGroups = permittedGroups
  } else {
    availableGroups = sortGroups(
      openGroups
        .concat(
          (memberGroups ?? []).filter(
            (g) => !openGroups.some((og) => og.id === g.id)
          )
        )
        .filter((group) => !ignoreGroupIds?.includes(group.id))
    )
  }
  const filteredGroups = sortGroups(
    availableGroups.filter((group) => searchInAny(query, group.name))
  )

  if (!showSelector || !creator) {
    return (
      <>
        <div className={'label justify-start'}>
          In Group:
          {selectedGroup ? (
            <span className=" ml-1.5 text-indigo-600">
              {selectedGroup?.name}
            </span>
          ) : (
            <span className=" ml-1.5 text-sm text-gray-600">(None)</span>
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
                className="w-full rounded-md border border-gray-300 bg-white p-3 pl-4 pr-20 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                onChange={(event) => setQuery(event.target.value)}
                displayValue={(group: Group) => group && group.name}
                placeholder={'E.g. Science, Politics'}
              />
              <Combobox.Button className="absolute inset-y-0 right-0 flex items-center rounded-r-md px-2 focus:outline-none">
                <SelectorIcon
                  className="h-5 w-5 text-gray-400"
                  aria-hidden="true"
                />
              </Combobox.Button>

              <Combobox.Options
                static={isCreatingNewGroup}
                className="absolute z-10 mt-1 max-h-60 w-full overflow-x-hidden rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none"
              >
                {filteredGroups.map((group: Group) => (
                  <Combobox.Option
                    key={group.id}
                    value={group}
                    className={({ active }) =>
                      clsx(
                        'relative h-12 cursor-pointer select-none py-2 pr-6 transition-colors',
                        active ? 'bg-indigo-500 text-white' : 'text-gray-900'
                      )
                    }
                  >
                    {({ active, selected }) => (
                      <>
                        {selected && (
                          <span
                            className={clsx(
                              'absolute inset-y-0 left-2 flex items-center pr-4',
                              active ? 'text-white' : 'text-indigo-600'
                            )}
                          >
                            <CheckIcon className="h-5 w-5" aria-hidden="true" />
                          </span>
                        )}
                        <span
                          className={clsx(
                            'ml-3 mt-1 flex flex-row justify-between',
                            selected && 'font-semibold'
                          )}
                        >
                          <Row className={'items-center gap-1 truncate pl-5'}>
                            {group.name}
                          </Row>
                          <Row
                            className={clsx(
                              'gap-2 text-sm text-gray-500',
                              active ? 'text-white' : 'text-gray-500'
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
                  user={creator}
                  onOpenStateChange={setIsCreatingNewGroup}
                  className={
                    'group flex w-full flex-row items-center justify-start rounded-none border-0 bg-white font-normal text-gray-900 transition-colors hover:bg-indigo-500 hover:text-white'
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
