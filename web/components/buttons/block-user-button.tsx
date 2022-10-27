import { usePrivateUser } from 'web/hooks/use-user'
import { privateUsers } from 'web/lib/firebase/users'
import { Button } from 'web/components/buttons/button'
import { withTracking } from 'web/lib/service/analytics'
import { toast } from 'react-hot-toast'
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore'

export function BlockUserButton(props: { userId: string }) {
  const { userId } = props
  const currentUser = usePrivateUser()
  if (!currentUser || currentUser.id === userId) return null
  const isBlocked = currentUser.blockedUserIds?.includes(userId)

  const blockUser = async () => {
    await updateDoc(doc(privateUsers, currentUser.id), {
      blockedUserIds: arrayUnion(userId),
    })
    await updateDoc(doc(privateUsers, userId), {
      blockedByUserIds: arrayUnion(currentUser.id),
    })
  }

  const unblockUser = async () => {
    await updateDoc(doc(privateUsers, currentUser.id), {
      blockedUserIds: arrayRemove(userId),
    })
    await updateDoc(doc(privateUsers, userId), {
      blockedByUserIds: arrayRemove(currentUser.id),
    })
  }

  const onBlock = async () => {
    await toast.promise(blockUser(), {
      loading: 'Blocking...',
      success: `You'll no longer see content from this user`,
      error: 'Error blocking user',
    })
  }

  if (isBlocked) {
    return (
      <Button
        size="sm"
        color="gray-outline"
        className="my-auto"
        onClick={withTracking(unblockUser, 'unblock')}
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
