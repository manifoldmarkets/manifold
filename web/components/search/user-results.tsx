import { UserSearchResult } from "web/lib/supabase/users"
import { Col } from "../layout/col"
import Link from "next/link"
import { Row } from "../layout/row"
import { Avatar } from "../widgets/avatar"
import { StackedUserNames } from "../widgets/user-link"
import { User } from "common/user"
import { FollowButton } from "../buttons/follow-button"
import { shortFormatNumber } from "common/util/format"

export const UserResults = 
(props: { users: UserSearchResult[],  onUserClick?: (user: User) => void }) => {
  return (
    <Col className={'mt-1 w-full gap-1'}>
      {props.users.map(
        (user) => {

            if (props.onUserClick) {
                          return (
            <div key={user.id} onClick={() => props.onUserClick!(user)}>
              <UserResult user={user} />
            </div>
          );
            }
            else {
                return (
          <Link key={user.id} href={`/${user.username}`}>
            <UserResult user={user}/>
          </Link>
                )
        }
    }
      )}
    </Col>
  )
}

function UserResult(props:{user:User}) {
    const {
          id,
          name,
          username,
          avatarUrl,
          bio,
          createdTime,
          creatorTraders,
        } = props.user
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
                      user={
                        { id, name, username, avatarUrl, createdTime } as User
                      }
                      className={'font-normal sm:text-lg'}
                      usernameClassName={'sm:text-sm font-normal'}
                    />
                  </Row>
                  <FollowButton size={'xs'} userId={id} />
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