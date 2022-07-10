import clsx from 'clsx'
import { useRouter } from 'next/router'
import { useState } from 'react'
import { groupPath } from 'web/lib/firebase/groups'
import { ConfirmationButton } from '../confirmation-button'
import { Col } from '../layout/col'
import { Spacer } from '../layout/spacer'
import { Title } from '../title'
import { FilterSelectUsers } from 'web/components/filter-select-users'
import { User } from 'common/user'
import { MAX_GROUP_NAME_LENGTH } from 'common/group'
import { createGroup } from 'web/lib/firebase/api'

export function CreateGroupButton(props: {
  user: User
  className?: string
  label?: string
  onOpenStateChange?: (isOpen: boolean) => void
  goToGroupOnSubmit?: boolean
  icon?: JSX.Element
}) {
  const { user, className, label, onOpenStateChange, goToGroupOnSubmit, icon } =
    props
  const [defaultName, setDefaultName] = useState(`${user.name}'s group`)
  const [name, setName] = useState('')
  const [memberUsers, setMemberUsers] = useState<User[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorText, setErrorText] = useState('')

  const router = useRouter()

  function updateMemberUsers(users: User[]) {
    const usersFirstNames = users.map((user) => user.name.split(' ')[0])
    const postFix =
      usersFirstNames.length > 3 ? ` & ${usersFirstNames.length - 3} more` : ''
    const newName = `${user.name.split(' ')[0]}${
      users.length > 0 ? ', ' + usersFirstNames.slice(0, 3).join(', ') : ''
    }${postFix}'s group`
    setDefaultName(newName)
    setMemberUsers(users)
  }

  const onSubmit = async () => {
    setIsSubmitting(true)
    const groupName = name !== '' ? name : defaultName
    const newGroup = {
      name: groupName,
      memberIds: memberUsers.map((user) => user.id),
      anyoneCanJoin: false,
    }
    const result = await createGroup(newGroup).catch((e) => {
      const errorDetails = e.details[0]
      if (errorDetails)
        setErrorText(
          `Error with ${errorDetails.field} field - ${errorDetails.error} `
        )
      else setErrorText(e.message)
      setIsSubmitting(false)
      console.error(e)
      return e
    })
    console.log(result.details)

    if (result.group) {
      updateMemberUsers([])
      if (goToGroupOnSubmit)
        router.push(groupPath(result.group.slug)).catch((e) => {
          console.log(e)
          setErrorText(e.message)
        })
      setIsSubmitting(false)
      return true
    } else {
      setIsSubmitting(false)
      return false
    }
  }

  return (
    <ConfirmationButton
      openModalBtn={{
        label: label ? label : 'Create Group',
        icon: icon,
        className: clsx(
          isSubmitting ? 'loading btn-disabled' : 'btn-primary',
          'btn-sm, normal-case',
          className
        ),
      }}
      submitBtn={{
        label: 'Create',
        className: clsx(
          'normal-case',
          isSubmitting ? 'loading btn-disabled' : ' btn-primary'
        ),
      }}
      onSubmitWithSuccess={onSubmit}
      onOpenChanged={(isOpen) => {
        onOpenStateChange?.(isOpen)
        updateMemberUsers([])
        setName('')
      }}
    >
      <Title className="!my-0" text="Create a group" />

      <Col className="gap-1 text-gray-500">
        <div>You can add markets and members to your group after creation.</div>
      </Col>
      <div className={'text-error'}>{errorText}</div>

      <div>
        <div className="form-control w-full">
          <label className="label">
            <span className="mb-0">Add members (optional)</span>
          </label>
          <FilterSelectUsers
            setSelectedUsers={updateMemberUsers}
            selectedUsers={memberUsers}
            ignoreUserIds={[user.id]}
          />
        </div>
        <div className="form-control w-full">
          <label className="label">
            <span className="mt-1">Group name (optional)</span>
          </label>
          <input
            placeholder={defaultName}
            className="input input-bordered resize-none"
            disabled={isSubmitting}
            value={name}
            maxLength={MAX_GROUP_NAME_LENGTH}
            onChange={(e) => setName(e.target.value || '')}
          />
        </div>

        <Spacer h={4} />
      </div>
    </ConfirmationButton>
  )
}
