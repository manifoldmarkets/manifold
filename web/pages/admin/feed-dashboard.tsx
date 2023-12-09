import { Col } from 'web/components/layout/col'
import { FeedTimelineContent } from 'web/components/feed-timeline'
import { useRecentlyActiveUsersAndPrivateUsers } from 'web/hooks/use-users'

export default function FeedDashboard() {
  const privateUsersAndUsers = useRecentlyActiveUsersAndPrivateUsers(8)
  return (
    <Col className={'grid-cols-16 grid w-full'}>
      {privateUsersAndUsers?.map(({ privateUser, user }) => (
        <Col key={user.id} className={'col-span-2'}>
          {privateUser && (
            <FeedTimelineContent user={user} privateUser={privateUser} />
          )}
        </Col>
      ))}
    </Col>
  )
}
