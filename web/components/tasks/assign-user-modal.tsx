import { useState } from 'react'
import { User } from 'common/user'
import { Avatar } from '../widgets/avatar'
import { Input } from '../widgets/input'
import { Modal, MODAL_CLASS } from '../layout/modal'
import { useEvent } from 'client-common/hooks/use-event'
import { searchUsers } from 'web/lib/supabase/users'

export function AssignUserModal(props: {
  open: boolean
  onClose: () => void
  onAssign: (userId: string) => void
}) {
  const { open, onClose, onAssign } = props
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState<User[]>([])

  const debouncedSearch = async (query: string) => {
    if (!query) {
      setUsers([])
      return
    }
    const result = await searchUsers(query, 10)
    setUsers(result)
  }

  const onChange = useEvent((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setQuery(value)
    debouncedSearch(value)
  })

  const onSelectUser = useEvent((userId: string) => {
    onAssign(userId)
    onClose()
  })

  return (
    <Modal open={open} onClose={onClose} size="md" className={MODAL_CLASS}>
      <span className="text-xl font-semibold">Assign task to user</span>

      <div className="mt-4">
        <Input
          type="text"
          placeholder="Search by username..."
          value={query}
          onChange={onChange}
          className="w-full"
          autoFocus
        />
      </div>

      <div className="mt-4 max-h-96 space-y-2 overflow-auto">
        {users.map((user) => (
          <button
            key={user.id}
            className="hover:bg-canvas-50 flex w-full items-center gap-3 rounded-lg p-2"
            onClick={() => onSelectUser(user.id)}
          >
            <Avatar username={user.username} avatarUrl={user.avatarUrl} />
            <div className="flex flex-col items-start">
              <span className="font-medium">{user.name}</span>
              <span className="text-ink-600 text-sm">@{user.username}</span>
            </div>
          </button>
        ))}
      </div>
    </Modal>
  )
}
