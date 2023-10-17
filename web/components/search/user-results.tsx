import { UserSearchResult } from 'web/lib/supabase/users'
import { Col } from '../layout/col'
import Link from 'next/link'
import { Row } from '../layout/row'
import { Avatar } from '../widgets/avatar'
import { StackedUserNames } from '../widgets/user-link'
import { User } from 'common/user'
import { FollowButton } from '../buttons/follow-button'
import { shortFormatNumber } from 'common/util/format'
import clsx from 'clsx'
import { LoadingIndicator } from '../widgets/loading-indicator'

export const UserResults = (props: {
  users: UserSearchResult[]
  userResultProps?: {
    onUserClick?: (user: User) => void
    showFollowButton?: boolean
    loadingUserId?: string
  }
}) => {
  const { users, userResultProps = {} } = props
  const { onUserClick, showFollowButton, loadingUserId } = userResultProps
  return (
    <Col className={'mt-1 w-full gap-1'}>
      {users.map((user) => {
        if (!!onUserClick) {
          return (
            <div
              key={user.id}
              onClick={() => {
                if (!loadingUserId) {
                  onUserClick(user)
                }
              }}
              className={clsx(loadingUserId ? 'pointer-events-none' : '')}
            >
              <UserResult user={user} loadingUserId={loadingUserId} />
            </div>
          )
        } else {
          return (
            <Link key={user.id} href={`/${user.username}`}>
              <UserResult user={user} />
            </Link>
          )
        }
      })}
    </Col>
  )
}

function UserResult(props: {
  user: User
  showFollow?: boolean
  loadingUserId?: string
}) {
  const { user, showFollow, loadingUserId } = props
  const { id, name, username, avatarUrl, bio, createdTime, creatorTraders } =
    user
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
              user={{ id, name, username, avatarUrl, createdTime } as User}
              className={'font-normal sm:text-lg'}
              usernameClassName={'sm:text-sm font-normal'}
            />
          </Row>
          <Row className="gap-1">
            {showFollow && <FollowButton size={'xs'} userId={id} />}
            {loadingUserId === id && <LoadingIndicator />}
          </Row>
        </Row>
        <div className={'text-ink-500 ml-1 line-clamp-2 text-sm'}>
          {creatorTraders.allTime > 0 && (
            <span className={'mr-1'}>
              {shortFormatNumber(creatorTraders.allTime)} traders
              {bio && ' •'}
            </span>
          )}
          <span>{bio}</span>
        </div>
      </Col>
    </Row>
  )
}
