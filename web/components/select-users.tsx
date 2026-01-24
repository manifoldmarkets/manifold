import { XIcon, SearchIcon } from '@heroicons/react/outline'
import { Fragment, useRef, useEffect, useState } from 'react'
import clsx from 'clsx'
import { Menu, MenuItem, MenuItems, Transition } from '@headlessui/react'
import { Avatar } from 'web/components/widgets/avatar'
import { Row } from 'web/components/layout/row'
import { UserLink } from 'web/components/widgets/user-link'
import { searchUsers, DisplayUser } from 'web/lib/supabase/users'
import { Col } from 'web/components/layout/col'
import { LoadingIndicator } from './widgets/loading-indicator'

export function SelectUsers(props: {
  setSelectedUsers: (users: DisplayUser[]) => void
  selectedUsers: DisplayUser[]
  ignoreUserIds: string[]
  showSelectedUsersTitle?: boolean
  selectedUsersClassName?: string
  showUserUsername?: boolean
  maxUsers?: number
  searchLimit?: number
  className?: string
}) {
  const {
    ignoreUserIds,
    selectedUsers,
    setSelectedUsers,
    showSelectedUsersTitle,
    selectedUsersClassName,
    showUserUsername,
    maxUsers,
    className,
    searchLimit,
  } = props
  const [query, setQuery] = useState('')
  const [filteredUsers, setFilteredUsers] = useState<DisplayUser[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const requestId = useRef(0)
  const queryReady = query.length > 1

  useEffect(() => {
    const id = ++requestId.current
    if (queryReady) {
      setIsSearching(true)
      searchUsers(query, searchLimit ?? 5).then((results) => {
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
          setIsSearching(false)
        }
      })
    } else {
      setFilteredUsers([])
      setIsSearching(false)
    }
  }, [query, selectedUsers, ignoreUserIds])

  const shouldShow = maxUsers ? selectedUsers.length < maxUsers : true

  const addUser = (user: DisplayUser) => {
    setQuery('')
    setSelectedUsers([...selectedUsers, user])
    inputRef.current?.focus()
  }

  const removeUser = (userId: string) => {
    setSelectedUsers(selectedUsers.filter(({ id }) => id !== userId))
  }

  return (
    <Col className={className}>
      {shouldShow && (
        <>
          <Col className="relative mt-1 w-full">
            <div
              className={clsx(
                'border-ink-300 dark:border-ink-400 bg-canvas-0 flex items-center gap-2 rounded-lg border px-3 py-2 transition-all',
                'focus-within:border-primary-500 focus-within:ring-primary-500/20 focus-within:ring-2'
              )}
            >
              <SearchIcon className="text-ink-400 h-5 w-5 flex-shrink-0" />
              <input
                ref={inputRef}
                type="text"
                name="user name"
                id="user name"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for people..."
                className="text-ink-900 placeholder:text-ink-400 w-full border-0 bg-transparent p-0 text-sm focus:outline-none focus:ring-0"
              />
            </div>
          </Col>

          <Menu
            as="div"
            className={clsx(
              'relative z-10 inline-block w-full text-right',
              (filteredUsers.length > 0 || isSearching) && 'h-56'
            )}
          >
            {queryReady && (filteredUsers.length > 0 || isSearching) && (
              <Transition
                show={queryReady}
                as={Fragment}
                enter="transition ease-out duration-100"
                enterFrom="transform opacity-0 scale-98"
                enterTo="transform opacity-100 scale-100"
                leave="transition ease-in duration-75"
                leaveFrom="transform opacity-100 scale-100"
                leaveTo="transform opacity-0 scale-98"
              >
                <MenuItems
                  static
                  className="bg-canvas-0 ring-ink-200 dark:ring-ink-300 absolute right-0 mt-2 max-h-[220px] w-full origin-top-right overflow-auto rounded-lg py-1 shadow-lg ring-1 focus:outline-none"
                >
                  {isSearching ? (
                    <div className="flex items-center justify-center py-8">
                      <LoadingIndicator size="sm" />
                    </div>
                  ) : (
                    filteredUsers.map((user) => (
                      <MenuItem key={user.id}>
                        <button
                          className="hover:bg-primary-50 dark:hover:bg-primary-900/20 data-[focus]:bg-primary-50 dark:data-[focus]:bg-primary-900/20 flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors"
                          onClick={() => addUser(user)}
                        >
                          <Avatar
                            username={user.username}
                            avatarUrl={user.avatarUrl}
                            size="sm"
                            className="ring-ink-200 dark:ring-ink-400 ring-1"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-ink-900 truncate text-sm font-medium">
                              {user.name}
                            </div>
                            {showUserUsername && (
                              <div className="text-ink-500 truncate text-xs">
                                @{user.username}
                              </div>
                            )}
                          </div>
                        </button>
                      </MenuItem>
                    ))
                  )}
                </MenuItems>
              </Transition>
            )}
          </Menu>
        </>
      )}
      {selectedUsers.length > 0 && (
        <>
          {showSelectedUsersTitle && (
            <div className="text-ink-500 mb-2 text-xs font-medium uppercase tracking-wide">
              Added members:
            </div>
          )}
          <Row className={clsx('mt-2 flex-wrap gap-2', selectedUsersClassName)}>
            {selectedUsers.map((user) => (
              <div
                key={user.id}
                className="bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2 text-sm font-medium"
              >
                <Avatar
                  username={user.username}
                  avatarUrl={user.avatarUrl}
                  size="2xs"
                  className="ring-primary-200 dark:ring-primary-700 ring-1"
                />
                <UserLink user={user} className="!text-current" />
                <button
                  onClick={() => removeUser(user.id)}
                  className="hover:bg-primary-200 dark:hover:bg-primary-800 -mr-0.5 rounded-full p-0.5 transition-colors"
                >
                  <XIcon className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            ))}
          </Row>
        </>
      )}
    </Col>
  )
}
