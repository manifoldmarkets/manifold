import { useState } from 'react'
import clsx from 'clsx'
import { PencilIcon } from '@heroicons/react/outline'

import { Group } from 'common/group'
import { deleteGroup, joinGroup, updateGroup } from 'web/lib/firebase/groups'
import { Spacer } from '../layout/spacer'
import { useRouter } from 'next/router'
import { Modal } from 'web/components/layout/modal'
import { FilterSelectUsers } from 'web/components/filter-select-users'
import { useMemberIds } from 'web/hooks/use-group'
import { Input } from '../widgets/input'
import { Button } from '../buttons/button'
import { UserSearchResult } from 'web/lib/supabase/users'

export function EditGroupButton(props: { group: Group; className?: string }) {
  const { group, className } = props
  const router = useRouter()

  const [name, setName] = useState(group.name)
  const [open, setOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [addMemberUsers, setAddMemberUsers] = useState<UserSearchResult[]>([])
  const memberIds = useMemberIds(group.id) ?? []
  function updateOpen(newOpen: boolean) {
    setAddMemberUsers([])
    setOpen(newOpen)
  }

  const saveDisabled = name === group.name && addMemberUsers.length === 0

  const onSubmit = async () => {
    setIsSubmitting(true)

    await Promise.all(
      addMemberUsers.map((user) => joinGroup(group.id, user.id))
    )
    await updateGroup(group, { name })

    setIsSubmitting(false)
    updateOpen(false)
  }

  return (
    <div className={clsx('flex p-1', className)}>
      <Button
        size="sm"
        color="gray-white"
        className="whitespace-nowrap"
        onClick={() => updateOpen(!open)}
      >
        <PencilIcon className="inline h-4 w-4" /> Edit
      </Button>
      <Modal open={open} setOpen={updateOpen}>
        <div className="bg-canvas-0 h-full rounded-md p-8">
          <div className="flex w-full flex-col">
            <label className="px-1 py-2">
              <span className="mb-1">Group name</span>
            </label>

            <Input
              placeholder="Your group name"
              disabled={isSubmitting}
              value={name}
              onChange={(e) => setName(e.target.value || '')}
            />
          </div>

          <Spacer h={4} />

          <div className="flex w-full flex-col">
            <label className="px-1 py-2">
              <span className="mb-0">Add members</span>
            </label>
            <FilterSelectUsers
              setSelectedUsers={setAddMemberUsers}
              selectedUsers={addMemberUsers}
              ignoreUserIds={memberIds}
            />
          </div>

          <div className="flex">
            <Button
              color="red"
              size="xs"
              onClick={() => {
                if (confirm('Are you sure you want to delete this group?')) {
                  deleteGroup(group)
                  updateOpen(false)
                  router.replace('/groups')
                }
              }}
            >
              Delete
            </Button>
            <Button
              color="gray-white"
              size="xs"
              onClick={() => updateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              color="green"
              disabled={saveDisabled}
              loading={isSubmitting}
              onClick={onSubmit}
            >
              Save
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
