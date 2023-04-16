import { Title } from 'web/components/widgets/title'
import { trackCallback } from 'web/lib/service/analytics'
import { Input } from 'web/components/widgets/input'
import { useState, useEffect, ReactNode } from 'react'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useUsersSupabase } from 'web/hooks/use-users'
import { UserSearchResult } from 'web/lib/supabase/users'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { UserLink } from 'web/components/widgets/user-link'
import { FollowButton } from 'web/components/buttons/follow-button'
import { User } from 'common/user'
import { useFollows } from 'web/hooks/use-follows'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin, follow, unfollow } from 'web/lib/firebase/users'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { VisibilityObserver } from 'web/components/widgets/visibility-observer'
import { useRouter } from 'next/router'
import { formatLargeNumber, formatMoney } from 'common/util/format'

export default function Users() {
  const router = useRouter()
  const { search } = router.query

  const [query, setQuery] = useState(search || '')
  const isMobile = useIsMobile()
  const [limit, setLimit] = useState(25)
  const users = useUsersSupabase(query.toString(), limit, [
    'bio',
    'followerCountCached',
    'creatorTraders',
    'profitCached',
  ])
  const currentUser = useUser()
  const myFollowedIds = useFollows(currentUser?.id)

  useEffect(() => {
    const searchQuery = router.query.search
    if (searchQuery) {
      setQuery(searchQuery.toString())
    }
  }, [router.query.search])

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value)
    setLimit(25) // Reset limit when query changes
  }

  return (
    <Page>
      <Col className={'w-full p-2'}>
        <Title className={'!mb-2'}>Users</Title>
        <Input
          type="text"
          inputMode="search"
          value={query}
          onChange={handleQueryChange}
          onBlur={trackCallback('search users', { query: query })}
          placeholder="Find users"
          className="w-full"
          autoFocus={!isMobile}
        />
        <Col className={'mt-2 gap-4 p-2'}>
          {users?.map((user) => {
            return (
              <UserListEntry
                key={user.id}
                user={user}
                currentUser={currentUser}
                isFollowing={
                  (myFollowedIds && myFollowedIds.includes(user.id)) ?? false
                }
              />
            )
          })}
        </Col>
        <VisibilityObserver
          onVisibilityUpdated={(isVisible) => {
            if (isVisible) setLimit(limit + 50)
          }}
        />
      </Col>
    </Page>
  )
}

const UserListEntry = (props: {
  user: UserSearchResult
  currentUser: User | null | undefined
  isFollowing: boolean
}) => {
  const { user, currentUser, isFollowing } = props
  const { avatarUrl, username, name, id } = user
  const { followerCountCached, creatorTraders, profitCached } = user
  const Metadata = (props: { children: ReactNode }) => (
    <span className={'text-ink-500 text-xs'}>{props.children}</span>
  )
  return (
    <Row className={'gap-2'}>
      <Col className={''}>
        <Avatar avatarUrl={avatarUrl} username={username} size={12} />
      </Col>
      <Col className={'w-full'}>
        <Row className={'w-full justify-between'}>
          <Col className={''}>
            <UserLink name={name} username={username} />
            <Row className={'gap-1'}>
              {followerCountCached > 0 && (
                <Metadata>{followerCountCached} followers</Metadata>
              )}
              {followerCountCached > 0 && creatorTraders.allTime > 0 && (
                <Metadata>•</Metadata>
              )}
              {creatorTraders.allTime > 0 && (
                <Metadata>
                  {formatLargeNumber(creatorTraders.allTime)} traders
                </Metadata>
              )}
              {((profitCached.allTime !== 0 && creatorTraders.allTime > 0) ||
                followerCountCached > 0) && <Metadata>•</Metadata>}
              {profitCached.allTime !== 0 && (
                <Metadata>{formatMoney(profitCached.allTime)} profit</Metadata>
              )}
            </Row>
          </Col>

          <FollowButton
            isFollowing={isFollowing}
            size={'xs'}
            onFollow={() => {
              if (!currentUser) return firebaseLogin()
              follow(currentUser.id, id)
            }}
            onUnfollow={() => {
              if (!currentUser) return firebaseLogin()
              unfollow(currentUser.id, id)
            }}
          />
        </Row>
        <span className={'line-clamp-2 text-ink-600 mt-1 text-sm'}>
          {user.bio}
        </span>
      </Col>
    </Row>
  )
}
