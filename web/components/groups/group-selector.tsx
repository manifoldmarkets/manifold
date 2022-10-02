import { Group } from 'common/group'
import { Combobox } from '@headlessui/react'
import { InfoTooltip } from 'web/components/info-tooltip'
import {
  CheckIcon,
  PlusCircleIcon,
  SelectorIcon,
  UserIcon,
} from '@heroicons/react/outline'
import clsx from 'clsx'
import { CreateGroupButton } from 'web/components/groups/create-group-button'
import { useState } from 'react'
import { useMemberGroups, useOpenGroups } from 'web/hooks/use-group'
import { User } from 'common/user'
import { searchInAny } from 'common/util/parse'
import { Row } from 'web/components/layout/row'

export function GroupSelector(props: {
  selectedGroup: Group | undefined
  setSelectedGroup: (group: Group) => void
  creator: User | null | undefined
  options: {
    showSelector: boolean
    showLabel: boolean
    ignoreGroupIds?: string[]
  }
}) {
  const { selectedGroup, setSelectedGroup, creator, options } = props
  const [isCreatingNewGroup, setIsCreatingNewGroup] = useState(false)
  const { showSelector, showLabel, ignoreGroupIds } = options
  const [query, setQuery] = useState('')
  const openGroups = useOpenGroups()
  const memberGroups = useMemberGroups(creator?.id)
  const memberGroupIds = memberGroups?.map((g) => g.id) ?? []

  const sortGroups = (groups: Group[]) =>
    groups.sort(
      (a, b) =>
        // weight group higher if user is a member
        (memberGroupIds.includes(b.id) ? 5 : 1) * b.totalContracts -
        (memberGroupIds.includes(a.id) ? 5 : 1) * a.totalContracts
    )

  const availableGroups = sortGroups(
    openGroups
      .concat(
        (memberGroups ?? []).filter(
          (g) => !openGroups.map((og) => og.id).includes(g.id)
        )
      )
      .filter((group) => !ignoreGroupIds?.includes(group.id))
  )

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
    <div className="form-control items-start">
      <Combobox
        as="div"
        value={selectedGroup}
        onChange={setSelectedGroup}
        nullable={true}
        className={'text-sm'}
      >
        {() => (
          <>
            {showLabel && (
              <Combobox.Label className="label justify-start gap-2 text-base">
                Add to Group
                <InfoTooltip text="Question will be displayed alongside the other questions in the group." />
              </Combobox.Label>
            )}
            <div className="relative mt-2">
              <Combobox.Input
                className="w-60 rounded-md border border-gray-300 bg-white p-3 pl-4 pr-20 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 "
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
                        'relative h-12 cursor-pointer select-none py-2 pr-6',
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
                            {memberGroupIds.includes(group.id) && (
                              <UserIcon
                                className={'text-primary h-4 w-4 shrink-0'}
                              />
                            )}
                            {group.name}
                          </Row>
                          <span
                            className={clsx(
                              'ml-1 w-[1.4rem] shrink-0 rounded-full bg-indigo-500 text-center text-white',
                              group.totalContracts > 99 ? 'w-[2.1rem]' : ''
                            )}
                          >
                            {group.totalContracts > 99
                              ? '99+'
                              : group.totalContracts}
                          </span>
                        </span>
                      </>
                    )}
                  </Combobox.Option>
                ))}

                <CreateGroupButton
                  user={creator}
                  onOpenStateChange={setIsCreatingNewGroup}
                  className={
                    'w-full justify-start rounded-none border-0 bg-white pl-2 font-normal text-gray-900 hover:bg-indigo-500 hover:text-white'
                  }
                  label={'Create a new Group'}
                  addGroupIdParamOnSubmit
                  icon={
                    <PlusCircleIcon className="text-primary mr-2 h-5 w-5" />
                  }
                />
              </Combobox.Options>
            </div>
          </>
        )}
      </Combobox>
    </div>
  )
}
