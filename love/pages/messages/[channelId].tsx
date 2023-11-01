import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { useRouter } from 'next/router'
import { useIsAuthorized, useUser } from 'web/hooks/use-user'
import { usePrivateMessageChannel } from 'web/hooks/use-private-messages'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { PrivateChat } from 'web/pages/messages/[channelId]'
import { LovePage } from 'love/components/love-page'

// For some reason this doesn't work just by importing <PrivateMessagesContent/>
export default function PrivateMessagesPage() {
  return (
    <LovePage trackPageView={'private messages page'}>
      <PrivateMessagesContent />
    </LovePage>
  )
}

export function PrivateMessagesContent() {
  useRedirectIfSignedOut()
  const router = useRouter()
  const user = useUser()
  const isAuthed = useIsAuthorized()
  const { channelId } = router.query as { channelId: string }
  const accessToChannel = usePrivateMessageChannel(
    user?.id,
    isAuthed,
    channelId
  )
  const loaded = isAuthed && accessToChannel !== undefined && channelId

  return (
    <>
      {user && loaded && accessToChannel?.id == parseInt(channelId) ? (
        <PrivateChat channel={accessToChannel} user={user} />
      ) : (
        <LoadingIndicator />
      )}
    </>
  )
}
