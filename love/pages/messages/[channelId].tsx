import { useRouter } from 'next/router'
import { usePrivateMessageChannelIds } from 'web/hooks/use-private-messages'
import { useIsAuthorized, useUser } from 'web/hooks/use-user'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { PrivateChat } from 'web/pages/messages/[channelId]'
import { LovePage } from 'love/components/love-page'

export default function PrivateMessagesPage() {
  useRedirectIfSignedOut()
  const router = useRouter()
  const user = useUser()
  const isAuthed = useIsAuthorized()
  const { channelId } = router.query as { channelId: string }
  const channelIds = usePrivateMessageChannelIds(user?.id, isAuthed)
  const loaded = isAuthed && channelIds !== undefined && channelId

  return (
    <LovePage trackPageView={'private messages page'}>
      {user && loaded && channelIds.includes(parseInt(channelId)) ? (
        <PrivateChat channelId={parseInt(channelId)} user={user} />
      ) : (
        <LoadingIndicator />
      )}
    </LovePage>
  )
}
