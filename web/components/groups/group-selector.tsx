import { Group } from 'common/group'
import { Combobox } from '@headlessui/react'
import { InfoTooltip } from 'web/components/info-tooltip'
import {
  CheckIcon,
  PlusCircleIcon,
  SelectorIcon,
} from '@heroicons/react/outline'
import clsx from 'clsx'
import { CreateGroupButton } from 'web/components/groups/create-group-button'
import { useState } from 'react'
import { useMemberGroups } from 'web/hooks/use-group'
import { User } from 'common/user'
import { searchInAny } from 'common/util/parse'

export function GroupSelector(props: {
  selectedGroup?: Group
  setSelectedGroup: (group: Group) => void
  creator: User | null | undefined
  showSelector?: boolean
}) {
  const { selectedGroup, setSelectedGroup, creator, showSelector } = props
  const [isCreatingNewGroup, setIsCreatingNewGroup] = useState(false)

  const [query, setQuery] = useState('')
  const memberGroups = useMemberGroups(creator?.id) ?? []
  const filteredGroups = memberGroups.filter((group) =>
    searchInAny(query, group.name)
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
            <Combobox.Label className="label justify-start gap-2 text-base">
              Add to Group
              <InfoTooltip text="Question will be displayed alongside the other questions in the group." />
            </Combobox.Label>
            <div className="relative mt-2">
              <Combobox.Input
                className="w-full rounded-md border border-gray-300 bg-white p-3 pl-4 pr-20 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 "
                onChange={(event) => setQuery(event.target.value)}
                displayValue={(group: Group) => group && group.name}
                placeholder={'None'}
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
                        'relative h-12 cursor-pointer select-none py-2 pl-4 pr-9',
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
                            'ml-5 mt-1 block truncate',
                            selected && 'font-semibold'
                          )}
                        >
                          {group.name}
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
                  goToGroupOnSubmit={false}
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
