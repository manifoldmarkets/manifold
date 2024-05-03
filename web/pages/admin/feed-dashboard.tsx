import { Col } from 'web/components/layout/col'
import { useRecentlyActiveUsersAndPrivateUsers } from 'web/hooks/use-users'
import { LiveGeneratedFeed } from 'web/components/feed/live-generated-feed'

export default function FeedDashboard() {
  const privateUsersAndUsers = useRecentlyActiveUsersAndPrivateUsers(8)
  return (
    <Col className={'grid-cols-16 grid w-full'}>
      {privateUsersAndUsers?.map(({ privateUser, user }) => (
        <Col key={user.id} className={'col-span-2'}>
          {privateUser && <LiveGeneratedFeed userId={user.id} />}
        </Col>
      ))}
    </Col>
  )
}
