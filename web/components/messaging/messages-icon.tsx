import { Row } from 'web/components/layout/row'
import { useEffect } from 'react'
import { useIsAuthorized, usePrivateUser } from 'web/hooks/use-user'
import { useRouter } from 'next/router'
import { PrivateUser } from 'common/user'
import { useUnseenPrivateMessageChannels } from 'web/hooks/use-private-messages'
import { db } from 'web/lib/supabase/db'
import { run } from 'common/supabase/utils'
import { BiEnvelope, BiSolidEnvelope } from 'react-icons/bi'
import clsx from 'clsx'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'

export function UnseenMessagesBubble() {
  const privateUser = usePrivateUser()
  const isAuthed = useIsAuthorized()

  if (!privateUser || !isAuthed) {
    return null
  }
  return (
    <InternalUnseenMessagesBubble
      iconClassName={'-mr-4'}
      isAuthed={isAuthed}
      privateUser={privateUser}
    />
  )
}

export function PrivateMessagesIcon(props: {
  className?: string
  solid?: boolean
}) {
  const { solid } = props
  const privateUser = usePrivateUser()
  const isAuthed = useIsAuthorized()
  const Icon = solid ? BiSolidEnvelope : BiEnvelope
  return (
    <Row className="relative justify-center">
      {privateUser && isAuthed && (
        <InternalUnseenMessagesBubble
          isAuthed={isAuthed}
          iconClassName={'-mt-2'}
          privateUser={privateUser}
        />
      )}
      <Icon className={props.className} />
    </Row>
  )
}

export function SolidPrivateMessagesIcon(props: { className?: string }) {
  return <PrivateMessagesIcon {...props} solid />
}

// Note: must be authorized to use this component
function InternalUnseenMessagesBubble(props: {
  privateUser: PrivateUser
  isAuthed: boolean
  iconClassName?: string
  className?: string
}) {
  const { privateUser, isAuthed, className, iconClassName } = props
  const { isReady, asPath } = useRouter()
  const [lastSeenTime, setLastSeenTime] = usePersistentLocalState(
    0,
    'last-seen-private-messages-page'
  )
  if (!isAuthed) console.error('must be authorized to use this component')
  useEffect(() => {
    if (isReady && asPath.endsWith('/messages')) {
      setLastSeenTime(Date.now())
      return
    }
    // on every path change, check the last time we saw the messages page
    run(
      db
        .from('user_events')
        .select('ts')
        .eq('name', 'view messages page')
        .eq('user_id', privateUser.id)
        .order('ts', { ascending: false })
        .limit(1)
    ).then(({ data }) => {
      setLastSeenTime(new Date(data[0]?.ts ?? 0).valueOf())
    })
  }, [isReady, asPath])

  const unseenMessages = useUnseenPrivateMessageChannels(
    privateUser.id,
    true,
    lastSeenTime
  )
    .filter((message) => message.createdTime > lastSeenTime)
    .filter((message) => !asPath.endsWith(`/messages/${message.channelId}`))

  if (unseenMessages.length === 0) return null

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
          iconClassName
        )}
      >
        {unseenMessages.length}
      </div>
    </Row>
  )
}
