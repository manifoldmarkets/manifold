import { Editor } from '@tiptap/core'
import clsx from 'clsx'
import { MAX_DESCRIPTION_LENGTH } from 'common/contract'
import { MAX_GROUP_NAME_LENGTH, PrivacyStatusType } from 'common/group'
import { User } from 'common/user'
import { useRouter } from 'next/router'
import { useState } from 'react'
import { createGroup } from 'web/lib/firebase/api'
import { getGroupWithFields } from 'web/lib/supabase/group'
import { ColorType } from '../buttons/button'
import { ConfirmationButton } from '../buttons/confirmation-button'
import { LOADING_PING_INTERVAL } from '../contract/waiting-for-supabase-button'
import { Col } from '../layout/col'
import { SCROLLABLE_MODAL_CLASS } from '../layout/modal'
import { TextEditor, useTextEditor } from '../widgets/editor'
import { Input } from '../widgets/input'
import { Title } from '../widgets/title'
import { savePost } from './group-about-section'
import { PrivacyStatusView } from './group-privacy-modal'

export function editorHasContent(editor: Editor | null) {
  if (!editor) {
    return false
  }
  const editorJSON = editor.getJSON()
  if (!editorJSON || !editorJSON.content) {
    return false
  }
  return (
    editorJSON.content.length >= 1 &&
    editorJSON.content.some(
      (content) => content.attrs || content.content || content.text
    )
  )
}

export function CreateGroupButton(props: {
  user: User
  className?: string
  label?: string
  onOpenStateChange?: (isOpen: boolean) => void
  goToGroupOnSubmit?: boolean
  addGroupIdParamOnSubmit?: boolean
  icon?: JSX.Element
  openModalBtnColor?: ColorType
}) {
  const {
    user,
    className,
    label,
    onOpenStateChange,
    goToGroupOnSubmit,
    addGroupIdParamOnSubmit,
    icon,
    openModalBtnColor,
  } = props

  const [name, setName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorText, setErrorText] = useState('')
  const [privacy, setPrivacy] = useState<PrivacyStatusType>('public')
  const router = useRouter()

  const editor = useTextEditor({
    key: 'create a group',
    size: 'lg',
    placeholder: 'Tell us what your group is about',
    defaultValue: undefined,
    max: MAX_DESCRIPTION_LENGTH,
  })

  const onSubmit = async () => {
    setIsSubmitting(true)
    const newGroup = {
      name,
      memberIds: [],
      privacyStatus: privacy,
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

    if (!result.group) {
      setIsSubmitting(false)
      return false
    }
    if (editorHasContent(editor)) {
      savePost(editor, result.group, null)
    }
    editor?.commands.clearContent(true)

    try {
      // Wrap the interval and timeout logic inside a Promise
      const waitForGroupUpdate = new Promise<boolean>((resolve, reject) => {
        const intervalId = setInterval(async () => {
          const groupWithFields = await getGroupWithFields(result.group.id)
          if (
            groupWithFields &&
            groupWithFields.slug &&
            groupWithFields.privacyStatus
          ) {
            clearInterval(intervalId) // Clear the interval
            if (goToGroupOnSubmit) {
              router.push(`/group/${result.group.slug}`)
            } else if (addGroupIdParamOnSubmit) {
              router.replace({
                pathname: router.pathname,
                query: { ...router.query, groupId: result.group.id },
              })
            }
            setIsSubmitting(false)
            resolve(true)
          }
        }, LOADING_PING_INTERVAL)

        // Set the timeout for 1 minute (60,000 ms)
        const _timeoutId = setTimeout(() => {
          clearInterval(intervalId) // Clear the interval
          setIsSubmitting(false)
          reject(false)
        }, 60000)
      })

      // Wait for the Promise to resolve or reject
      return await waitForGroupUpdate
    } catch (e) {
      setIsSubmitting(false)
      return false
    }
  }

  if (user.isBannedFromPosting) return <></>

  return (
    <ConfirmationButton
      openModalBtn={{
        label: label ? label : 'New Group',
        icon: icon,
        className: className,
        disabled: isSubmitting,
        color: openModalBtnColor,
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
        editor?.commands.clearContent(true)
      }}
      disabled={editor?.storage.upload.mutation.isLoading}
    >
      <Col className={clsx('-mx-4 gap-4 px-4', SCROLLABLE_MODAL_CLASS)}>
        <Title className="!my-0" children="Create a group" />

        <Col className="text-ink-500">
          <div>You can add questions to your group after creation.</div>
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
        </div>

        <div className="flex w-full flex-col">
          <label className="mb-2 ml-1 mt-0">Privacy</label>
          <Col>
            <PrivacyStatusView
              viewStatus={'public'}
              isSelected={privacy == 'public'}
              onClick={() => setPrivacy('public')}
              size="sm"
            />
            <PrivacyStatusView
              viewStatus={'curated'}
              isSelected={privacy == 'curated'}
              onClick={() => setPrivacy('curated')}
              size="sm"
            />
            <PrivacyStatusView
              viewStatus={'private'}
              isSelected={privacy == 'private'}
              onClick={() => setPrivacy('private')}
              size="sm"
            />
          </Col>
        </div>

        <div className="flex w-full flex-col">
          <label className="mb-2 ml-1 mt-0">
            About <span className="text-ink-400">(optional)</span>
          </label>
          <TextEditor editor={editor} />
        </div>
      </Col>
    </ConfirmationButton>
  )
}
