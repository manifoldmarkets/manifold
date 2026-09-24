import type { UserEntitlement } from 'common/shop/types'
import { useDisplayUserById } from 'web/hooks/use-user-supabase'
import { Avatar, type AvatarSizeType } from '../widgets/avatar'

export function SocialAvatar(props: {
  user: {
    id?: string
    username?: string
    avatarUrl?: string
    entitlements?: UserEntitlement[]
  }
  size?: AvatarSizeType
  noLink?: boolean
  className?: string
}) {
  const { user, size, noLink, className } = props
  const fetchedUser = useDisplayUserById(
    user.entitlements === undefined ? user.id : undefined
  )
  const entitlements =
    user.entitlements ??
    (fetchedUser?.id === user.id ? fetchedUser?.entitlements : undefined)

  return (
    <Avatar
      username={user.username}
      avatarUrl={user.avatarUrl}
      entitlements={entitlements}
      displayContext="posts"
      size={size}
      noLink={noLink}
      className={className}
    />
  )
}
