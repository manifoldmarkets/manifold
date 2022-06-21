import { UserIcon } from '@heroicons/react/outline'
import { useUsers } from 'web/hooks/use-users'
import { User } from 'common/user'
import { Fragment, useState } from 'react'
import clsx from 'clsx'
import { Menu, Transition } from '@headlessui/react'
import { Avatar } from 'web/components/avatar'
import { Row } from 'web/components/layout/row'

export function FilterSelectUsers(props: {
  setSelectedUsers: (users: User[]) => void
  selectedUsers: User[]
  ignoreUserIds: string[]
}) {
  const { ignoreUserIds, selectedUsers, setSelectedUsers } = props
  const users = useUsers()
  const [query, setQuery] = useState('')

  const filteredUsers =
    query === ''
      ? users
      : users.filter((user: User) => {
          return (
            !selectedUsers.map((user) => user.name).includes(user.name) &&
            !ignoreUserIds.includes(user.id) &&
            user.name.toLowerCase().includes(query.toLowerCase())
          )
        })
  return (
    <div>
      <div className="relative mt-1 rounded-md">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <UserIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
        </div>
        <input
          type="text"
          name="user name"
          id="user name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="input input-bordered block w-full pl-10 focus:border-gray-300 "
          placeholder="Austin Chen"
        />
      </div>
      <Menu
        as="div"
        className={clsx(
          'relative inline-block w-full text-right',
          query !== '' && 'h-36'
        )}
      >
        {({}) => (
          <Transition
            show={query !== ''}
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
              className="absolute right-0 mt-2 w-full origin-top-right cursor-pointer divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none"
            >
              <div className="py-1">
                {filteredUsers.map((user: User) => (
                  <Menu.Item key={user.id}>
                    {({ active }) => (
                      <span
                        className={clsx(
                          active
                            ? 'bg-gray-100 text-gray-900'
                            : 'text-gray-700',
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
      {selectedUsers.length > 0 && (
        <>
          <div className={'mb-2'}>Added members:</div>
          <Row className="mt-0 grid grid-cols-6 gap-2">
            {selectedUsers.map((user: User) => (
              <div key={user.id} className="col-span-2 flex items-center">
                <Avatar
                  username={user.username}
                  avatarUrl={user.avatarUrl}
                  size={'sm'}
                />
                <span className="ml-2">{user.name}</span>
              </div>
            ))}
          </Row>
        </>
      )}
    </div>
  )
}
