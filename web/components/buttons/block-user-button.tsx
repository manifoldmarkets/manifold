import { usePrivateUser } from 'web/hooks/use-user'
import { updatePrivateUser } from 'web/lib/firebase/users'
import { Button } from 'web/components/buttons/button'
import { withTracking } from 'web/lib/service/analytics'
import { uniq } from 'lodash'
import { toast } from 'react-hot-toast'

export function BlockUserButton(props: { userId: string }) {
  const { userId } = props
  const user = usePrivateUser()
  if (!user || user.id === userId) return null
  const isBlocked = user.blockedUserIds?.includes(userId)

  const onBlock = async () => {
    await toast.promise(
      updatePrivateUser(user.id, {
        blockedUserIds: uniq([...(user.blockedUserIds ?? []), userId]),
      }),
      {
        loading: 'Blocking...',
        success: `You'll no longer see content from this user`,
        error: 'Error blocking user',
      }
    )
  }
  const onUnblock = async () => {
    await updatePrivateUser(user.id, {
      blockedUserIds: user.blockedUserIds?.filter((id) => id !== userId) ?? [],
    })
  }

  if (isBlocked) {
    return (
      <Button
        size="sm"
        color="gray-outline"
        className="my-auto"
        onClick={withTracking(onUnblock, 'unblock')}
      >
        Blocked
      </Button>
    )
  }

  return (
    <Button
      size="sm"
      color="red"
      className="my-auto"
      onClick={withTracking(onBlock, 'block')}
    >
      Block
    </Button>
  )
}
