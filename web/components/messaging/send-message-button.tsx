import { User } from 'common/user'
import { Button } from 'web/components/buttons/button'
import { createPrivateMessageChannelWithUser } from 'web/lib/firebase/api'
import { useRouter } from 'next/router'

export const SendMessageButton = (props: { toUser: User }) => {
  const { toUser } = props
  const router = useRouter()

  const sendMessage = async () => {
    const res = await createPrivateMessageChannelWithUser({
      userId: toUser.id,
    })
    if (res.status !== 'success') return
    router.push(`/messages/${res.channelId}`)
  }

  return (
    <Button className={''} onClick={sendMessage}>
      Send Message
    </Button>
  )
}
