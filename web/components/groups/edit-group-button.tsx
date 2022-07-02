import { useState } from 'react'
import clsx from 'clsx'
import { PencilIcon } from '@heroicons/react/outline'

import { Group } from 'common/group'
import { deleteGroup, updateGroup } from 'web/lib/firebase/groups'
import { Spacer } from '../layout/spacer'
import { useRouter } from 'next/router'
import { Modal } from 'web/components/layout/modal'
import { FilterSelectUsers } from 'web/components/filter-select-users'
import { User } from 'common/user'
import { uniq } from 'lodash'

export function EditGroupButton(props: { group: Group; className?: string }) {
  const { group, className } = props
  const { memberIds } = group
  const router = useRouter()

  const [name, setName] = useState(group.name)
  const [about, setAbout] = useState(group.about ?? '')
  const [open, setOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [addMemberUsers, setAddMemberUsers] = useState<User[]>([])

  function updateOpen(newOpen: boolean) {
    setAddMemberUsers([])
    setOpen(newOpen)
  }

  const saveDisabled =
    name === group.name && about === group.about && addMemberUsers.length === 0

  const onSubmit = async () => {
    setIsSubmitting(true)

    await updateGroup(group, {
      name,
      about,
      memberIds: uniq([...memberIds, ...addMemberUsers.map((user) => user.id)]),
    })

    setIsSubmitting(false)
    updateOpen(false)
  }

  return (
    <div className={clsx('flex p-1', className)}>
      <div
        className={clsx(
          'btn-ghost cursor-pointer whitespace-nowrap rounded-md p-1 text-sm text-gray-700'
        )}
        onClick={() => updateOpen(!open)}
      >
        <PencilIcon className="inline h-4 w-4" /> Edit
      </div>
      <Modal open={open} setOpen={updateOpen}>
        <div className="h-full rounded-md bg-white p-8">
          <div className="form-control w-full">
            <label className="label">
              <span className="mb-1">Group name</span>
            </label>

            <input
              placeholder="Your group name"
              className="input input-bordered resize-none"
              disabled={isSubmitting}
              value={name}
              onChange={(e) => setName(e.target.value || '')}
            />
          </div>

          <Spacer h={4} />

          <div className="form-control w-full">
            <label className="label">
              <span className="mb-1">About</span>
            </label>

            <input
              placeholder="Short description (140 characters max)"
              className="input input-bordered resize-none"
              disabled={isSubmitting}
              value={about}
              maxLength={140}
              onChange={(e) => setAbout(e.target.value || '')}
            />
          </div>

          <Spacer h={4} />

          <div className="form-control w-full">
            <label className="label">
              <span className="mb-0">Add members</span>
            </label>
            <FilterSelectUsers
              setSelectedUsers={setAddMemberUsers}
              selectedUsers={addMemberUsers}
              ignoreUserIds={memberIds}
            />
          </div>

          <div className="modal-action">
            <label
              htmlFor="edit"
              onClick={() => {
                if (confirm('Are you sure you want to delete this group?')) {
                  deleteGroup(group)
                  updateOpen(false)
                  router.replace('/groups')
                }
              }}
              className={clsx(
                'btn btn-sm btn-outline mr-auto self-center hover:border-red-500 hover:bg-red-500'
              )}
            >
              Delete
            </label>
            <label
              htmlFor="edit"
              className={'btn'}
              onClick={() => updateOpen(false)}
            >
              Cancel
            </label>
            <label
              className={clsx(
                'btn',
                saveDisabled ? 'btn-disabled' : 'btn-primary',
                isSubmitting && 'loading'
              )}
              htmlFor="edit"
              onClick={onSubmit}
            >
              Save
            </label>
          </div>
        </div>
      </Modal>
    </div>
  )
}
