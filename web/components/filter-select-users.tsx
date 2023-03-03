import { UserIcon, XIcon } from '@heroicons/react/outline'
import { Fragment, useRef, useEffect, useState } from 'react'
import clsx from 'clsx'
import { Menu, Transition } from '@headlessui/react'
import { Avatar } from 'web/components/widgets/avatar'
import { Row } from 'web/components/layout/row'
import { UserLink } from 'web/components/widgets/user-link'
import { Input } from './widgets/input'
import { searchUsers, UserSearchResult } from 'web/lib/supabase/users'

export function FilterSelectUsers(props: {
  setSelectedUsers: (users: UserSearchResult[]) => void
  selectedUsers: UserSearchResult[]
  ignoreUserIds: string[]
  showSelectedUsersTitle?: boolean
  selectedUsersClassName?: string
  maxUsers?: number
}) {
  const {
    ignoreUserIds,
    selectedUsers,
    setSelectedUsers,
    showSelectedUsersTitle,
    selectedUsersClassName,
    maxUsers,
  } = props
  const [query, setQuery] = useState('')
  const [filteredUsers, setFilteredUsers] = useState<UserSearchResult[]>([])

  const requestId = useRef(0)
  useEffect(() => {
    const id = ++requestId.current
    if (query.length > 2) {
      searchUsers(query, 5).then((results) => {
        // if there's a more recent request, forget about this one
        if (id === requestId.current) {
          setFilteredUsers(
            results.filter((user) => {
              return (
                !selectedUsers.some(({ name }) => name === user.name) &&
                !ignoreUserIds.includes(user.id)
              )
            })
          )
        }
      })
    } else {
      setFilteredUsers([])
    }
  }, [query, selectedUsers, ignoreUserIds])

  const shouldShow = maxUsers ? selectedUsers.length < maxUsers : true
  return (
    <div>
      {shouldShow && (
        <>
          <div className="relative mt-1 rounded-md">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <UserIcon className="text-ink-400 h-5 w-5" aria-hidden="true" />
            </div>
            <Input
              type="text"
              name="user name"
              id="user name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="block w-full pl-10"
              placeholder="Austin Chen"
            />
          </div>
          <Menu
            as="div"
            className={clsx(
              'relative inline-block w-full overflow-y-scroll text-right',
              query.length > 2 && 'h-36'
            )}
          >
            {({}) => (
              <Transition
                show={query.length > 2}
                as={Fragment}
                enter="transition ease-out duration-100"
                enterFrom="transform opacity-0 scale-95"
                enterTo="transform opacity-100 scale-100"
                leave="transition ease-in duration-75"
                leaveFrom="transform opacity-100 scale-100"
                leaveTo="transform opacity-0 scale-95"
              >
                <Menu.Items
                  static={true}
                  className="divide-ink-100 bg-canvas-0 ring-ink-1000 absolute right-0 mt-2 w-full origin-top-right cursor-pointer divide-y rounded-md shadow-lg ring-1 ring-opacity-5 focus:outline-none"
                >
                  <div className="py-1">
                    {filteredUsers.map((user) => (
                      <Menu.Item key={user.id}>
                        {({ active }) => (
                          <span
                            className={clsx(
                              active
                                ? 'bg-ink-100 text-ink-900'
                                : 'text-ink-700',
                              'group flex items-center px-4 py-2 text-sm'
                            )}
                            onClick={() => {
                              setQuery('')
                              setSelectedUsers([...selectedUsers, user])
                            }}
                          >
                            <Avatar
                              username={user.username}
                              avatarUrl={user.avatarUrl}
                              size={'xs'}
                              className={'mr-2'}
                            />
                            {user.name}
                          </span>
                        )}
                      </Menu.Item>
                    ))}
                  </div>
                </Menu.Items>
              </Transition>
            )}
          </Menu>
        </>
      )}
      {selectedUsers.length > 0 && (
        <>
          <div className={'mb-2'}>
            {showSelectedUsersTitle && 'Added members:'}
          </div>
          <Row
            className={clsx(
              'mt-0 grid grid-cols-6 gap-2',
              selectedUsersClassName
            )}
          >
            {selectedUsers.map((user) => (
              <div
                key={user.id}
                className="col-span-2 flex flex-row items-center justify-between"
              >
                <Row className={'items-center'}>
                  <Avatar
                    username={user.username}
                    avatarUrl={user.avatarUrl}
                    size={'sm'}
                  />
                  <UserLink
                    username={user.username}
                    className="ml-2"
                    name={user.name}
                  />
                </Row>
                <XIcon
                  onClick={() =>
                    setSelectedUsers([
                      ...selectedUsers.filter(({ id }) => id != user.id),
                    ])
                  }
                  className=" text-ink-400 h-5 w-5 cursor-pointer"
                  aria-hidden="true"
                />
              </div>
            ))}
          </Row>
        </>
      )}
    </div>
  )
}
