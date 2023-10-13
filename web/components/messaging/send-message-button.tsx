import { User } from 'common/user'
import { Button } from 'web/components/buttons/button'
import { createPrivateMessageChannelWithUser } from 'web/lib/firebase/api'
import { useRouter } from 'next/router'
import { BiEnvelope } from 'react-icons/bi'

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
    <Button size={'sm'} onClick={sendMessage}>
      <BiEnvelope className={'h-5 w-5'} />
    </Button>
  )
}
