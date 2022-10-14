import { useRouter } from 'next/router'
import { useState } from 'react'
import { groupPath } from 'web/lib/firebase/groups'
import { ConfirmationButton } from '../buttons/confirmation-button'
import { Col } from '../layout/col'
import { Spacer } from '../layout/spacer'
import { Title } from '../title'
import { User } from 'common/user'
import { MAX_GROUP_NAME_LENGTH } from 'common/group'
import { createGroup } from 'web/lib/firebase/api'
import { Input } from '../input'

export function CreateGroupButton(props: {
  user: User
  className?: string
  label?: string
  onOpenStateChange?: (isOpen: boolean) => void
  goToGroupOnSubmit?: boolean
  addGroupIdParamOnSubmit?: boolean
  icon?: JSX.Element
}) {
  const {
    user,
    className,
    label,
    onOpenStateChange,
    goToGroupOnSubmit,
    addGroupIdParamOnSubmit,
    icon,
  } = props

  const [name, setName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorText, setErrorText] = useState('')

  const router = useRouter()

  const onSubmit = async () => {
    setIsSubmitting(true)
    const newGroup = {
      name,
      memberIds: [],
      anyoneCanJoin: true,
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
      if (goToGroupOnSubmit)
        router.push(groupPath(result.group.slug)).catch((e) => {
          console.log(e)
          setErrorText(e.message)
        })
      else if (addGroupIdParamOnSubmit) {
        router.replace({
          pathname: router.pathname,
          query: { ...router.query, groupId: result.group.id },
        })
      }
      setIsSubmitting(false)
      return true
    } else {
      setIsSubmitting(false)
      return false
    }
  }

  if (user.isBannedFromPosting) return <></>

  return (
    <ConfirmationButton
      openModalBtn={{
        label: label ? label : 'Create Group',
        icon: icon,
        className: className,
        disabled: isSubmitting,
      }}
      submitBtn={{
        label: 'Create',
        color: 'green',
        isSubmitting,
      }}
      onSubmitWithSuccess={onSubmit}
      onOpenChanged={(isOpen) => {
        onOpenStateChange?.(isOpen)
        setName('')
      }}
    >
      <Title className="!my-0" text="Create a group" />

      <Col className="gap-1 text-gray-500">
        <div>You can add markets to your group after creation.</div>
      </Col>
      {errorText && <div className={'text-error'}>{errorText}</div>}

      <div className="flex w-full flex-col">
        <label className="mb-2 ml-1 mt-0">Group name</label>
        <Input
          placeholder={'Your group name'}
          disabled={isSubmitting}
          value={name}
          maxLength={MAX_GROUP_NAME_LENGTH}
          onChange={(e) => setName(e.target.value || '')}
        />

        <Spacer h={4} />
      </div>
    </ConfirmationButton>
  )
}
