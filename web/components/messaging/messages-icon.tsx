import { Row } from 'web/components/layout/row'
import { useIsAuthorized, usePrivateUser } from 'web/hooks/use-user'
import { PrivateUser } from 'common/user'
import { useUnseenPrivateMessageChannels } from 'web/hooks/use-private-messages'
import { BiEnvelope, BiSolidEnvelope } from 'react-icons/bi'
import clsx from 'clsx'

export function UnseenMessagesBubble(props: { className?: string }) {
  const { className } = props
  const privateUser = usePrivateUser()
  const isAuthed = useIsAuthorized()

  if (!privateUser || !isAuthed) {
    return null
  }
  return (
    <InternalUnseenMessagesBubble
      bubbleClassName={clsx('-mr-4', className)}
      isAuthed={isAuthed}
      privateUser={privateUser}
    />
  )
}

export function PrivateMessagesIcon(props: {
  className?: string
  bubbleClassName?: string
  solid?: boolean
}) {
  const { solid, className, bubbleClassName } = props
  const privateUser = usePrivateUser()
  const isAuthed = useIsAuthorized()
  const Icon = solid ? BiSolidEnvelope : BiEnvelope
  return (
    <Row className="relative justify-center">
      {privateUser && isAuthed && (
        <InternalUnseenMessagesBubble
          isAuthed={isAuthed}
          bubbleClassName={clsx('-mt-2', bubbleClassName)}
          privateUser={privateUser}
        />
      )}
      <Icon className={className} />
    </Row>
  )
}

// Note: must be authorized to use this component
function InternalUnseenMessagesBubble(props: {
  privateUser: PrivateUser
  isAuthed: boolean
  bubbleClassName?: string
  className?: string
}) {
  const { privateUser, isAuthed, className, bubbleClassName } = props
  if (!isAuthed) console.error('must be authorized to use this component')

  const { unseenMessages } = useUnseenPrivateMessageChannels(
    privateUser.id,
    true
  )

  if (
    unseenMessages.length === 0 ||
    !privateUser.notificationPreferences.new_message.includes('browser') ||
    privateUser.notificationPreferences.opt_out_all.includes('browser')
  )
    return null

  return (
    <Row
      className={clsx(
        'absolute left-0 right-0 top-1 items-center justify-center',
        className
      )}
    >
      <div
        className={clsx(
          'text-ink-0 bg-primary-500 min-w-[15px] rounded-full p-[2px] text-center text-[10px] leading-3 ',
          bubbleClassName
        )}
      >
        {unseenMessages.length}
      </div>
    </Row>
  )
}
