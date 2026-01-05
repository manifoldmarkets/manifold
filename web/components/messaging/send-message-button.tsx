import clsx from 'clsx'
import { User } from 'common/user'
import { Button } from 'web/components/buttons/button'
import { useRouter } from 'next/router'
import { BiEnvelope } from 'react-icons/bi'
import { useSortedPrivateMessageMemberships } from 'web/hooks/use-private-messages'
import { usePrivateUser } from 'web/hooks/use-user'
import { findKey } from 'lodash'
import { useState } from 'react'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import {
  createPrivateMessageChannelWithUsers,
  sendUserPrivateMessage,
} from 'web/lib/api/api'
import { useTextEditor } from 'web/components/widgets/editor'
import { MAX_COMMENT_LENGTH } from 'common/comment'
import { CommentInputTextArea } from 'web/components/comments/comment-input'
import { Row } from 'web/components/layout/row'
import { firebaseLogin } from 'web/lib/firebase/users'
import { Avatar } from 'web/components/widgets/avatar'

export const SendMessageButton = (props: {
  toUser: User
  currentUser: User | undefined | null
  includeLabel?: boolean
  circleButton?: boolean
}) => {
  const { toUser, currentUser, includeLabel, circleButton } = props
  const router = useRouter()
  const privateUser = usePrivateUser()
  const channelMemberships = useSortedPrivateMessageMemberships(currentUser?.id)
  const { memberIdsByChannelId } = channelMemberships

  const [openComposeModal, setOpenComposeModal] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const messageButtonClicked = async () => {
    if (!currentUser) return firebaseLogin()
    const previousDirectMessageChannel = findKey(
      memberIdsByChannelId,
      (dm) => dm.includes(toUser.id) && dm.length === 1
    )

    const previousChannelId =
      previousDirectMessageChannel !== undefined
        ? previousDirectMessageChannel
        : undefined

    if (previousChannelId) router.push(`/messages/${previousChannelId}`)
    else setOpenComposeModal(true)
  }
  const editor = useTextEditor({
    key: `compose-new-message-${toUser.id}`,
    size: 'sm',
    max: MAX_COMMENT_LENGTH,
    placeholder: 'Write your message...',
  })

  const sendMessage = async () => {
    if (!editor) return
    setSubmitting(true)
    setError('')
    const res = await createPrivateMessageChannelWithUsers({
      userIds: [toUser.id],
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
      {circleButton ? (
        <button
          className="bg-primary-500 hover:bg-primary-600 flex h-8 w-8 items-center justify-center rounded-full shadow-sm transition-all hover:shadow"
          onClick={messageButtonClicked}
        >
          <BiEnvelope className="h-4.5 w-4.5 text-white" />
        </button>
      ) : (
        <Button size="sm" onClick={messageButtonClicked} className="gap-1.5">
          <BiEnvelope className="h-4 w-4" />
          {includeLabel && <span>Message</span>}
        </Button>
      )}

      <Modal open={openComposeModal} setOpen={setOpenComposeModal} size="md">
        <Col className="bg-canvas-0 overflow-hidden rounded-xl shadow-2xl">
          {/* Header with recipient info */}
          <div className="border-ink-200 dark:border-ink-300 border-b px-6 py-4">
            <h2 className="text-ink-900 text-lg font-semibold">New message</h2>
            <Row className="mt-3 items-center gap-3">
              <Avatar
                username={toUser.username}
                avatarUrl={toUser.avatarUrl}
                size="md"
                className="ring-ink-200 dark:ring-ink-400 ring-1"
              />
              <div>
                <div className="text-ink-900 font-medium">{toUser.name}</div>
                <div className="text-ink-500 text-sm">@{toUser.username}</div>
              </div>
            </Row>
          </div>

          {/* Message input */}
          <div className="px-6 py-4">
            <CommentInputTextArea
              autoFocus={true}
              editor={editor}
              user={currentUser}
              submit={sendMessage}
              isSubmitting={!editor || submitting}
              submitOnEnter={false}
              hideToolbar={true}
            />
            {error && (
              <div className="bg-scarlet-50 dark:bg-scarlet-900/20 text-scarlet-600 dark:text-scarlet-400 mt-3 rounded-lg px-3 py-2 text-sm">
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-ink-200 dark:border-ink-300 bg-canvas-50 dark:bg-canvas-0 flex items-center justify-end gap-3 border-t px-6 py-4">
            <Button
              color="gray-white"
              onClick={() => setOpenComposeModal(false)}
              className="text-ink-600 hover:text-ink-900"
            >
              Cancel
            </Button>
            <Button
              disabled={!editor || submitting}
              loading={submitting}
              onClick={sendMessage}
              className="min-w-[80px] shadow-sm"
            >
              Send
            </Button>
          </div>
        </Col>
      </Modal>
    </>
  )
}
