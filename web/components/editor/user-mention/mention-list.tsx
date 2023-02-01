import { SuggestionProps } from '@tiptap/suggestion'
import clsx from 'clsx'
import { User } from 'common/user'
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { Avatar } from '../../widgets/avatar'

type LiteUser = Pick<
  User,
  'id' | 'name' | 'username' | 'avatarUrl' | 'followerCountCached'
>

// copied from https://tiptap.dev/api/nodes/mention#usage
export const MentionList = forwardRef(
  (props: SuggestionProps<LiteUser>, ref) => {
    const { items: users, command } = props

    const [selectedIndex, setSelectedIndex] = useState(0)
    useEffect(() => setSelectedIndex(0), [users])

    const submitUser = (index: number) => {
      const user = users[index]
      if (user) command({ id: user.id, label: user.username } as any)
    }

    const onUp = () =>
      setSelectedIndex((i) => (i + users.length - 1) % users.length)
    const onDown = () => setSelectedIndex((i) => (i + 1) % users.length)
    const onEnter = () => submitUser(selectedIndex)

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: any) => {
        if (event.key === 'ArrowUp') {
          onUp()
          return true
        }
        if (event.key === 'ArrowDown') {
          onDown()
          return true
        }
        if (event.key === 'Enter') {
          onEnter()
          return true
        }
        return false
      },
    }))

    return (
      <div className="w-42 absolute z-10 overflow-x-hidden rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
        {!users.length ? (
          <span className="m-1 whitespace-nowrap">No results...</span>
        ) : (
          users.map((user, i) => (
            <button
              className={clsx(
                'flex h-8 w-full cursor-pointer select-none items-center gap-2 truncate px-4',
                selectedIndex === i
                  ? 'bg-indigo-500 text-white'
                  : 'text-gray-900'
              )}
              onClick={() => submitUser(i)}
              key={user.id}
            >
              <Avatar avatarUrl={user.avatarUrl} size="xs" noLink />
              {user.username}
            </button>
          ))
        )}
      </div>
    )
  }
)
