import { Row } from 'web/components/layout/row'
import { usePrivateUser } from 'web/hooks/use-user'
import { PrivateUser } from 'common/user'
import { useUnseenPrivateMessageChannels } from 'web/hooks/use-private-messages'
import { BiEnvelope, BiSolidEnvelope } from 'react-icons/bi'
import clsx from 'clsx'
import { usePathname } from 'next/navigation'

export function UnseenMessagesBubble(props: { className?: string }) {
  const { className } = props
  const privateUser = usePrivateUser()

  if (!privateUser) {
    return null
  }
  return (
    <InternalUnseenMessagesBubble
      bubbleClassName={clsx('-mr-4', className)}
      privateUser={privateUser}
    />
  )
}

export function UnreadPrivateMessages(props: { className?: string }) {
  const { className } = props
  const privateUser = usePrivateUser()
  return (
    <Row className="relative justify-center">
      {privateUser && (
        <InternalUnseenMessagesBubble
          bubbleClassName={clsx(className)}
          privateUser={privateUser}
        />
      )}
    </Row>
  )
}

function InternalUnseenMessagesBubble(props: {
  privateUser: PrivateUser
  bubbleClassName?: string
}) {
  const { privateUser, bubbleClassName } = props

  const unseenMessages = useUnseenPrivateMessageChannels(privateUser.id)
  const pathName = usePathname()

  if (
    unseenMessages.length === 0 ||
    !privateUser.notificationPreferences.new_message.includes('browser') ||
    privateUser.notificationPreferences.opt_out_all.includes('browser') ||
    pathName === '/messages'
  )
    return null

  return (
    <div
      className={clsx(
        'text-ink-0 bg-primary-400 min-w-[15px] rounded-full p-[2px] text-center text-xs leading-3 ',
        bubbleClassName
      )}
    >
      {unseenMessages.length}
    </div>
  )
}
