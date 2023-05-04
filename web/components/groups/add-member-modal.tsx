import { JSONContent } from '@tiptap/core'
import clsx from 'clsx'
import { Group } from 'common/group'
import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useRealtimeGroupMemberIds } from 'web/hooks/use-group-supabase'
import { addGroupMember } from 'web/lib/firebase/api'
import { searchUsersNotInGroup } from 'web/lib/supabase/users'
import { Button, buttonClass } from '../buttons/button'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Avatar } from '../widgets/avatar'
import { Input } from '../widgets/input'
import { UserLink } from '../widgets/user-link'
import DropdownMenu from '../comments/dropdown-menu'
import { buildArray } from 'common/util/array'
import { ChevronDownIcon } from '@heroicons/react/solid'
import { useIsAuthorized } from 'web/hooks/use-user'

const QUERY_SIZE = 7

export function AddMemberContent(props: {
  query: string
  setQuery: (query: string) => void
  group: Group
}) {
  const { query, setQuery, group } = props

  const [searchMemberResult, setSearchMemberResult] = useState<JSONContent[]>(
    []
  )
  const requestId = useRef(0)
  const [loading, setLoading] = useState(false)
  const groupMemberIds = useRealtimeGroupMemberIds(group.id).members
  const isAuth = useIsAuthorized()
  useEffect(() => {
    if (isAuth) {
      console.log('isAuth', isAuth)
    }
  })
  useEffect(() => {
    const id = ++requestId.current
    setLoading(true)
    searchUsersNotInGroup(query, QUERY_SIZE, group.id)
      .then((results) => {
        // if there's a more recent request, forget about this one
        if (id === requestId.current) {
          setSearchMemberResult(results)
        }
      })
      .finally(() => setLoading(false))
  }, [query])

  return (
    <>
      <Input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search users"
        className={clsx('placeholder:text-ink-400 w-full')}
      />
      <Col className="justify-between">
        <Col
          className={clsx(loading ? 'animate-pulse' : '', 'gap-4', 'w-full')}
        >
          {searchMemberResult.length == 0 && (
            <div className="text-ink-500">No members found</div>
          )}
          {searchMemberResult.map((user) => (
            <AddMemberWidget
              key={user.id}
              user={user}
              group={group}
              isDisabled={groupMemberIds.some(
                (memberId) => memberId == user.id
              )}
            />
          ))}
        </Col>
      </Col>
    </>
  )
}

export function AddMemberWidget(props: {
  user: JSONContent
  group: Group
  isDisabled?: boolean
}) {
  const { user, group, isDisabled } = props
  const [disabled, setDisabled] = useState(isDisabled)
  const errorMessage = 'Could not add member, try again?'
  const groupMemberOptions = buildArray(
    // ADMIN ONLY: if the member is below admin, can upgrade to admin{
    {
      name: 'Add as moderator',
      onClick: async () => {
        toast.promise(
          addGroupMember({
            groupId: group.id,
            userId: user.id,
            role: 'moderator',
          }),
          {
            loading: `Adding ${user.name} as moderator...`,
            success: `${user.name} is now a moderator!`,
            error: errorMessage,
          }
        )
      },
    },
    {
      name: 'Add as admin',
      onClick: async () => {
        toast.promise(
          addGroupMember({
            groupId: group.id,
            userId: user.id,
            role: 'admin',
          }),
          {
            loading: `Adding ${user.name} to admin...`,
            success: `${user.name} is now a admin!`,
            error: errorMessage,
          }
        )
      },
    }
  )
  return (
    <Row className="w-full items-center justify-between gap-4">
      <Row className="w-3/4 gap-2">
        <Avatar
          username={user.username}
          avatarUrl={user.avatarurl}
          size="xs"
          noLink
        />
        <span className="line-clamp-1 overflow-hidden">
          <UserLink name={user.name} username={user.username} />
        </span>
      </Row>
      <Row>
        <Button
          color="indigo-outline"
          size="2xs"
          disabled={disabled}
          className={'rounded-r-none'}
          onClick={() =>
            toast.promise(
              addGroupMember({ groupId: group.id, userId: user.id }).then(() =>
                setDisabled(true)
              ),
              {
                loading: `Adding ${user.name}`,
                success: `Added ${user.name}`,
                error: `Unable to add ${user.name}. Try again?`,
              }
            )
          }
        >
          Add
        </Button>
        <DropdownMenu
          Items={groupMemberOptions}
          Icon={
            <ChevronDownIcon className={clsx('text-primary-500 h-5 w-5')} />
          }
          menuWidth={'w-40'}
          buttonClass={clsx(
            buttonClass('2xs', 'indigo-outline'),
            'rounded-l-none border-l-0 px-1 py-[5px]'
          )}
        />
      </Row>
    </Row>
  )
}
