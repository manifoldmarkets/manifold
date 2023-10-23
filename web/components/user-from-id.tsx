import { useUserById } from 'web/hooks/use-user-supabase'
import { Row } from 'web/components/layout/row'
import { UserAvatarAndBadge } from 'web/components/widgets/user-link'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'

export const UserFromId = (props: { userId: string; className?: string }) => {
  const { userId, className } = props
  const user = useUserById(userId)
  return (
    <Row className={className}>
      {user ? (
        <UserAvatarAndBadge
          name={user.name}
          username={user.username}
          avatarUrl={user.avatarUrl}
        />
      ) : (
        <LoadingIndicator />
      )}
    </Row>
  )
}
