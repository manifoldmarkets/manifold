import clsx from 'clsx'
import {
  TOPIC_KEY,
  MAX_GROUP_NAME_LENGTH,
  PrivacyStatusType,
} from 'common/group'
import { User } from 'common/user'
import { useRouter } from 'next/router'
import { useState } from 'react'
import { createGroup } from 'web/lib/firebase/api'
import { getGroupWithFields } from 'web/lib/supabase/group'
import { Col } from '../layout/col'
import { Modal, SCROLLABLE_MODAL_CLASS } from '../layout/modal'
import { Input } from '../widgets/input'
import { PrivacyStatusView } from './group-privacy-modal'
import { Button } from 'web/components/buttons/button'
import { Row } from 'web/components/layout/row'

const LOADING_PING_INTERVAL = 200

export function CreateGroupModal(props: {
  user: User | null | undefined
  open: boolean
  setOpen: (open: boolean) => void
  goToGroupOnSubmit?: boolean
  addGroupIdParamOnSubmit?: boolean
  className?: string
}) {
  const {
    user,
    className,
    goToGroupOnSubmit,
    addGroupIdParamOnSubmit,
    setOpen,
    open,
  } = props

  const [name, setName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorText, setErrorText] = useState('')
  const [privacy, setPrivacy] = useState<PrivacyStatusType>('public')
  const router = useRouter()

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
              router.push(`questions?${TOPIC_KEY}=${result.group.slug}`)
            } else if (addGroupIdParamOnSubmit) {
              router.replace({
                pathname: router.pathname,
                query: { ...router.query, groupIds: [result.group.id] },
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

  if (user?.isBannedFromPosting) return <></>

  return (
    <Modal open={open} setOpen={setOpen}>
      <Col
        className={clsx(
          ' bg-canvas-50 gap-4 rounded-md p-4',
          className,
          SCROLLABLE_MODAL_CLASS
        )}
      >
        <Col className="">
          <span className="text-primary-700 text-2xl">Create a topic</span>

          <div className={'text-ink-500 mt-2 text-sm'}>
            You can add questions to your topic after creation.
          </div>
        </Col>
        {errorText && <div className={'text-error'}>{errorText}</div>}

        <Col>
          <label className="mb-2 ml-1 mt-0">Topic name</label>
          <Input
            placeholder={'Your topic name'}
            disabled={isSubmitting}
            value={name}
            maxLength={MAX_GROUP_NAME_LENGTH}
            onChange={(e) => setName(e.target.value || '')}
          />
        </Col>

        <Col>
          <label className="mb-2 ml-1 mt-0">Type</label>
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
        </Col>
        <Col className={''}>
          <Row className={' justify-between'}>
            <Button color={'gray-outline'} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={isSubmitting}
              disabled={isSubmitting || name === ''}
              color={'indigo'}
              onClick={onSubmit}
            >
              Create
            </Button>
          </Row>
        </Col>
      </Col>
    </Modal>
  )
}
