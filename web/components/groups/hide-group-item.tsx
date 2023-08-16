import { BanIcon, CheckIcon } from '@heroicons/react/solid'
import { PrivateUser } from 'common/user'
import { uniq } from 'lodash'
import { toast } from 'react-hot-toast'
import { updatePrivateUser } from 'web/lib/firebase/users'

export function getBlockGroupDropdownItem(props: {
  groupSlug: string
  user: PrivateUser
}) {
  const { groupSlug, user } = props
  const isBlocked = user.blockedGroupSlugs?.includes(groupSlug)
  const onBlock = async () => {
    await toast.promise(
      updatePrivateUser(user.id, {
        blockedGroupSlugs: uniq([...(user.blockedGroupSlugs ?? []), groupSlug]),
      }),
      {
        loading: 'Blocking...',
        success: `You'll no longer see questions from this group`,
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
  return {
    name: isBlocked
      ? 'Unblock questions from this category'
      : "Don't show questions from this category",
    icon: isBlocked ? (
      <CheckIcon className="h-5 w-5" />
    ) : (
      <BanIcon className="h-5 w-5" />
    ),
    onClick: isBlocked ? onUnblock : onBlock,
  }
}
