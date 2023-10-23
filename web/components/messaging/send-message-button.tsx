import { User } from 'common/user'
import { Button } from 'web/components/buttons/button'
import { useRouter } from 'next/router'
import { BiEnvelope } from 'react-icons/bi'
import {
  useOtherUserIdsInPrivateMessageChannelIds,
  usePrivateMessageChannelIds,
} from 'web/hooks/use-private-messages'
import { useIsAuthorized, usePrivateUser } from 'web/hooks/use-user'
import { findKey, first } from 'lodash'
import { useState } from 'react'
import { Modal, MODAL_CLASS } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import {
  createPrivateMessageChannelWithUser,
  sendUserPrivateMessage,
} from 'web/lib/firebase/api'
import { useTextEditor } from 'web/components/widgets/editor'
import { MAX_COMMENT_LENGTH } from 'common/comment'
import { CommentInputTextArea } from 'web/components/comments/comment-input'
import { Title } from 'web/components/widgets/title'
import { Row } from 'web/components/layout/row'
import { firebaseLogin } from 'web/lib/firebase/users'

export const SendMessageButton = (props: {
  toUser: User
  currentUser: User | undefined | null
}) => {
  const { toUser, currentUser } = props
  const router = useRouter()
  const privateUser = usePrivateUser()
  const isAuthed = useIsAuthorized()
  const channelIds = usePrivateMessageChannelIds(currentUser?.id, isAuthed)
  const channelIdsToUserIds = useOtherUserIdsInPrivateMessageChannelIds(
    currentUser?.id,
    isAuthed,
    channelIds
  )
  const [openComposeModal, setOpenComposeModal] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const messageButtonClicked = async () => {
    if (!currentUser) return firebaseLogin()
    if (!isAuthed) return
    const keyFound = findKey(
      channelIdsToUserIds,
      (values: string[]) => values.length === 1 && first(values) === toUser.id
    )

    const previousChannelId =
      keyFound !== undefined ? parseInt(keyFound) : undefined

    if (previousChannelId) router.push(`/messages/${previousChannelId}`)
    else setOpenComposeModal(true)
  }
  const editor = useTextEditor({
    key: `compose-new-message-${toUser.id}`,
    size: 'sm',
    max: MAX_COMMENT_LENGTH,
    placeholder: 'Say something...',
  })

  const sendMessage = async () => {
    if (!editor) return
    setSubmitting(true)
    const res = await createPrivateMessageChannelWithUser({
      userId: toUser.id,
    }).catch((e) => {
      setError(e.message)
      setSubmitting(false)
      return
    })
    if (!res) return

    const msgRes = await sendUserPrivateMessage({
      channelId: res.channelId,
      content: editor.getJSON(),
    }).catch((e) => {
      setError(e.message)
      setSubmitting(false)
      return
    })
    if (!msgRes) return

    router.push(`/messages/${res.channelId}`)
  }

  if (privateUser?.blockedByUserIds.includes(toUser.id)) return null

  return (
    <>
      <Button size={'sm'} onClick={messageButtonClicked}>
        <BiEnvelope className={'h-5 w-5'} />
      </Button>
      <Modal open={openComposeModal} setOpen={setOpenComposeModal}>
        <Col className={MODAL_CLASS}>
          <Row className={'w-full'}>
            <Title className={'!mb-2'}>Message {toUser.name}</Title>
          </Row>
          <CommentInputTextArea
            editor={editor}
            user={currentUser}
            submit={sendMessage}
            isSubmitting={!editor || submitting}
            submitOnEnter={true}
            hideToolbar={true}
          />
          <span className={'text-red-500'}>{error}</span>
        </Col>
      </Modal>
    </>
  )
}
