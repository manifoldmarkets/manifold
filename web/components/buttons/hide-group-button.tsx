import { usePrivateUser } from 'web/hooks/use-user'
import { updatePrivateUser } from 'web/lib/firebase/users'
import { Button } from 'web/components/buttons/button'
import { withTracking } from 'web/lib/service/analytics'
import { uniq } from 'lodash'
import { toast } from 'react-hot-toast'

export function HideGroupButton(props: { groupSlug: string }) {
  const { groupSlug } = props
  const user = usePrivateUser()
  if (!user) return null
  const isBlocked = user.blockedGroupSlugs?.includes(groupSlug)

  const onBlock = async () => {
    await toast.promise(
      updatePrivateUser(user.id, {
        blockedGroupSlugs: uniq([...(user.blockedGroupSlugs ?? []), groupSlug]),
      }),
      {
        loading: 'Blocking...',
        success: `You'll no longer see markets from this group`,
        error: 'Error blocking user',
      }
    )
  }
  const onUnblock = async () => {
    await updatePrivateUser(user.id, {
      blockedGroupSlugs:
        user.blockedGroupSlugs?.filter((id) => id !== groupSlug) ?? [],
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
        Group Hidden
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
      Hide Group
    </Button>
  )
}
