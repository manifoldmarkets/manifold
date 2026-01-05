import { PlusIcon, SearchIcon, XIcon } from '@heroicons/react/solid'
import { Button } from '../buttons/button'
import { useState, useRef, useEffect, Fragment } from 'react'
import { Modal } from '../layout/modal'
import { Col } from '../layout/col'
import { createPrivateMessageChannelWithUsers } from 'web/lib/api/api'
import { useRouter } from 'next/router'
import clsx from 'clsx'
import { Row } from 'web/components/layout/row'
import { DisplayUser } from 'common/api/user-types'
import { usePrivateUser } from 'web/hooks/use-user'
import { buildArray } from 'common/util/array'
import { Avatar } from 'web/components/widgets/avatar'
import { searchUsers } from 'web/lib/supabase/users'
import { Menu, MenuItem, MenuItems, Transition } from '@headlessui/react'
import { LoadingIndicator } from '../widgets/loading-indicator'

export default function NewMessageButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        className="gap-2 shadow-sm transition-shadow hover:shadow"
        onClick={() => setOpen(true)}
      >
        <PlusIcon className="h-4 w-4" aria-hidden="true" />
        New Message
      </Button>
      <NewMessageModal open={open} setOpen={setOpen} />
    </>
  )
}

function NewMessageModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { open, setOpen } = props
  const privateUser = usePrivateUser()
  const router = useRouter()

  const [users, setUsers] = useState<DisplayUser[]>([])
  const [query, setQuery] = useState('')
  const [filteredUsers, setFilteredUsers] = useState<DisplayUser[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const requestId = useRef(0)

  const queryReady = query.length > 1

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
    } else {
      // Reset state when modal closes
      setUsers([])
      setQuery('')
      setFilteredUsers([])
    }
  }, [open])

  useEffect(() => {
    const id = ++requestId.current
    if (queryReady) {
      setIsSearching(true)
      searchUsers(query, 10).then((results) => {
        if (id === requestId.current) {
          const ignoreIds = users
            .map((user) => user.id)
            .concat(privateUser?.blockedUserIds ?? [])
            .concat(buildArray(privateUser?.id))

          setFilteredUsers(
            results.filter(
              (user) =>
                !users.some(({ name }) => name === user.name) &&
                !ignoreIds.includes(user.id)
            )
          )
          setIsSearching(false)
        }
      })
    } else {
      setFilteredUsers([])
      setIsSearching(false)
    }
  }, [query, users, privateUser?.blockedUserIds, privateUser?.id])

  const createChannel = async () => {
    if (users.length === 0) return
    setIsCreating(true)
    const res = await createPrivateMessageChannelWithUsers({
      userIds: users.map((user) => user.id),
    }).catch((e) => {
      console.error(e)
      setIsCreating(false)
      return
    })
    if (!res) {
      setIsCreating(false)
      return
    }
    router.push(`/messages/${res.channelId}`)
    setOpen(false)
  }

  const addUser = (user: DisplayUser) => {
    setUsers([...users, user])
    setQuery('')
    inputRef.current?.focus()
  }

  const removeUser = (userId: string) => {
    setUsers(users.filter((u) => u.id !== userId))
  }

  return (
    <Modal open={open} setOpen={setOpen} size="md">
      <Col className="bg-canvas-0 overflow-hidden rounded-xl shadow-2xl">
        {/* Header */}
        <div className="border-ink-200 dark:border-ink-300 border-b px-6 py-4">
          <h2 className="text-ink-900 text-lg font-semibold">New message</h2>
          <p className="text-ink-500 mt-0.5 text-sm">
            Start a conversation with one or more people
          </p>
        </div>

        {/* Content */}
        <div className="min-h-[340px] px-6 py-4">
          {/* Search input with selected users */}
          <div
            className={clsx(
              'border-ink-300 dark:border-ink-400 bg-canvas-50 flex min-h-[48px] flex-wrap items-center gap-2 rounded-lg border px-3 py-2 transition-all',
              'focus-within:border-primary-500 focus-within:ring-primary-500/20 focus-within:ring-2'
            )}
          >
            <SearchIcon className="text-ink-400 h-5 w-5 flex-shrink-0" />

            {/* Selected user chips */}
            {users.map((user) => (
              <div
                key={user.id}
                className="bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 animate-in fade-in slide-in-from-left-2 flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2 text-sm font-medium duration-150"
              >
                <Avatar
                  username={user.username}
                  avatarUrl={user.avatarUrl}
                  size="2xs"
                  className="ring-primary-200 dark:ring-primary-700 ring-1"
                />
                <span className="max-w-[120px] truncate">{user.name}</span>
                <button
                  onClick={() => removeUser(user.id)}
                  className="hover:bg-primary-200 dark:hover:bg-primary-800 -mr-0.5 rounded-full p-0.5 transition-colors"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}

            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                users.length === 0 ? 'Search for people...' : 'Add more...'
              }
              className="text-ink-900 placeholder:text-ink-400 min-w-[100px] flex-1 border-0 bg-transparent p-0 text-sm focus:outline-none focus:ring-0"
            />
          </div>

          {/* Search results dropdown */}
          <Menu as="div" className="relative mt-2">
            {queryReady && (filteredUsers.length > 0 || isSearching) && (
              <Transition
                show={true}
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
                  className="bg-canvas-0 ring-ink-200 dark:ring-ink-300 absolute z-10 max-h-[280px] w-full overflow-auto rounded-lg py-1 shadow-lg ring-1"
                >
                  {isSearching ? (
                    <div className="flex items-center justify-center py-8">
                      <LoadingIndicator size="md" />
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
                            <div className="text-ink-500 truncate text-xs">
                              @{user.username}
                            </div>
                          </div>
                        </button>
                      </MenuItem>
                    ))
                  )}
                </MenuItems>
              </Transition>
            )}
          </Menu>

          {/* Empty state hint */}
          {users.length === 0 && !queryReady && (
            <p className="text-ink-400 mt-4 text-center text-sm">
              Type a name to search for people to message
            </p>
          )}

          {/* Selected users preview for groups */}
          {users.length > 1 && (
            <div className="mt-4">
              <p className="text-ink-500 mb-2 text-xs font-medium uppercase tracking-wide">
                Group conversation with {users.length} people
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-ink-200 dark:border-ink-300 bg-canvas-50 dark:bg-canvas-0 flex items-center justify-end gap-3 border-t px-6 py-4">
          <Button
            color="gray-white"
            onClick={() => setOpen(false)}
            className="text-ink-600 hover:text-ink-900"
          >
            Cancel
          </Button>
          <Button
            disabled={users.length === 0}
            loading={isCreating}
            onClick={createChannel}
            className="min-w-[100px] shadow-sm"
          >
            {users.length > 1 ? 'Create Group' : 'Start Chat'}
          </Button>
        </div>
      </Col>
    </Modal>
  )
}
