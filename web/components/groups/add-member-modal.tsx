import clsx from 'clsx'
import { Group } from 'common/group'
import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { addGroupMember } from 'web/lib/firebase/api'
import { getGroupMemberIds } from 'web/lib/supabase/group'
import {
  searchUsers,
  searchUsersExcludingArray,
  UserSearchResult,
} from 'web/lib/supabase/users'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { Modal, MODAL_CLASS } from '../layout/modal'
import { Row } from '../layout/row'
import { Avatar } from '../widgets/avatar'
import { Input } from '../widgets/input'

const QUERY_SIZE = 7

export function AddMemberModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
  group: Group
}) {
  const { open, setOpen, group } = props
  const [query, setQuery] = useState('')
  const [searchMemberResult, setSearchMemberResult] = useState<
    UserSearchResult[]
  >([])
  const [groupMemberIds, setGroupMemberIds] = useState<string[]>([])
  const requestId = useRef(0)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getGroupMemberIds(group.id).then((result) => {
      const nonNullGroupMemberIds = result.filter((id) => id !== null)
      setGroupMemberIds(nonNullGroupMemberIds)
    })
  }, [group.id])

  useEffect(() => {
    const id = ++requestId.current
    setLoading(true)
    searchUsersExcludingArray(query, QUERY_SIZE, groupMemberIds)
      .then((results) => {
        // if there's a more recent request, forget about this one
        if (id === requestId.current) {
          setSearchMemberResult(results)
        }
      })
      .finally(() => setLoading(false))
  }, [query])
  return (
    <Modal open={open} setOpen={setOpen}>
      <Col className={clsx(MODAL_CLASS, 'h-[30rem]')}>
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search users"
          className={clsx('w-full placeholder:text-gray-400')}
        />
        <Col
          className={clsx(loading ? 'animate-pulse' : '', 'gap-4', 'w-full')}
        >
          {searchMemberResult.length == 0 && (
            <div className="text-gray-500">No members found</div>
          )}
          {searchMemberResult.map((user) => (
            <Row className="w-full items-center justify-between gap-4">
              <Row className="w-3/4 gap-2">
                <Avatar
                  username={user.username}
                  avatarUrl={user.avatarUrl}
                  size="xs"
                  noLink
                />
                <span className="line-clamp-1 overflow-hidden">
                  {user.name}{' '}
                  {user.username !== user.name && (
                    <span className="font-light text-gray-400">
                      @{user.username}
                    </span>
                  )}
                </span>
              </Row>
              <Button
                color="indigo-outline"
                size="2xs"
                onClick={() =>
                  toast.promise(
                    addGroupMember({ groupId: group.id, userId: user.id }),
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
            </Row>
          ))}
        </Col>
      </Col>
    </Modal>
  )
}
