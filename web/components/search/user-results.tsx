import { LiteUser } from 'common/api/user-types'
import Link from 'next/link'
import { FollowButton } from '../buttons/follow-button'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Avatar } from '../widgets/avatar'
import { StackedUserNames } from '../widgets/user-link'

export const UserResults = (props: { users: LiteUser[] }) => {
  const { users } = props

  return (
    <Col className={'mt-1 w-full gap-1'}>
      {users.map((user) => {
        return (
          <Link key={user.id} href={`/${user.username}`}>
            <UserResult user={user} />
          </Link>
        )
      })}
    </Col>
  )
}

function UserResult(props: { user: LiteUser }) {
  const { id, name, username, avatarUrl, bio, createdTime } = props.user

  return (
    <Row className={'hover:bg-primary-100 p-1'}>
      <Col className={'w-full'}>
        <Row className={'justify-between'}>
          <Row className={'gap-1'}>
            <Avatar
              username={username}
              avatarUrl={avatarUrl}
              className={'mt-1'}
            />
            <StackedUserNames
              user={{ id, name, username, createdTime }}
              className={'font-normal sm:text-lg'}
              usernameClassName={'sm:text-sm font-normal'}
            />
          </Row>
          <Row className="gap-1">
            <FollowButton size={'xs'} userId={id} />
          </Row>
        </Row>
        <div className={'text-ink-500 ml-1 line-clamp-2 text-sm'}>
          <span>{bio}</span>
        </div>
      </Col>
    </Row>
  )
}
