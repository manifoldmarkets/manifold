import { LovePage } from 'love/components/love-page'
import { PrivateMessagesContent } from 'web/pages/messages/[channelId]'

export default function PrivateMessagesPage() {
  return (
    <LovePage trackPageView={'private messages page'}>
      <PrivateMessagesContent />
    </LovePage>
  )
}
