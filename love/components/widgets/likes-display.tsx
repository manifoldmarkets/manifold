import { orderBy, keyBy } from 'lodash'
import Image from 'next/image'
import Link from 'next/link'
import { UserIcon } from '@heroicons/react/solid'

import { Lover } from 'common/love/lover'
import { useLoverByUserId } from 'love/hooks/use-lover'
import { Col } from 'web/components/layout/col'
import { Avatar, EmptyAvatar } from 'web/components/widgets/avatar'
import { Carousel } from 'web/components/widgets/carousel'
import { UserLink } from 'web/components/widgets/user-link'
import { useUser } from 'web/hooks/use-user'
import { useUserById } from 'web/hooks/use-user-supabase'
import { SendMessageButton } from 'web/components/messaging/send-message-button'
import { LikeData } from 'love/lib/supabase/likes'

export const LikesDisplay = (props: {
  likesGiven: LikeData[]
  likesReceived: LikeData[]
  profileLover: Lover
}) => {
  const { likesGiven, likesReceived, profileLover } = props

  const likesGivenByUserId = keyBy(likesGiven, (l) => l.userId)
  const likesRecievedByUserId = keyBy(likesReceived, (l) => l.userId)
  const mutualLikeUserIds = Object.keys(likesGivenByUserId).filter(
    (userId) => likesRecievedByUserId[userId]
  )

  const mutualLikes = mutualLikeUserIds.map((userId) => {
    const likeGiven = likesGivenByUserId[userId]
    const likeReceived = likesRecievedByUserId[userId]
    const createdTime = Math.max(
      likeGiven.createdTime,
      likeReceived.createdTime
    )
    return { userId, createdTime }
  })
  const sortedMutualLikes = orderBy(mutualLikes, 'createdTime', 'desc')
  const onlyLikesGiven = likesGiven.filter(
    (l) => !likesRecievedByUserId[l.userId]
  )
  const onlyLikesReceived = likesReceived.filter(
    (l) => !likesGivenByUserId[l.userId]
  )

  return (
    <Col className="gap-2">
      {sortedMutualLikes.length > 0 && (
        <Col className="gap-2">
          <div className="text-lg">Mutual likes</div>
          <Carousel>
            {sortedMutualLikes.map((like) => {
              return (
                <MatchTile
                  key={like.userId}
                  matchUserId={like.userId}
                  profileLover={profileLover}
                />
              )
            })}
          </Carousel>
        </Col>
      )}

      {(onlyLikesGiven.length > 0 || onlyLikesReceived.length > 0) && (
        <>
          <LikesList label="Likes received" likes={onlyLikesReceived} />
          <LikesList label="Likes given" likes={onlyLikesGiven} />
        </>
      )}
    </Col>
  )
}

const LikesList = (props: { label: string; likes: LikeData[] }) => {
  const { label, likes } = props

  const maxShown = 10
  const sortedLikes = orderBy(likes, 'createdTime', 'desc').slice(0, maxShown)

  return (
    <Col className="gap-1">
      <div className="whitespace-nowrap text-lg">{label}</div>
      {sortedLikes.length > 0 ? (
        <Carousel className="w-full" labelsParentClassName="gap-0">
          {sortedLikes.map((like) => (
            <UserAvatar
              className="-ml-1 first:ml-0"
              key={like.userId}
              userId={like.userId}
            />
          ))}
        </Carousel>
      ) : (
        <div className="text-ink-500">None</div>
      )}
    </Col>
  )
}

const UserAvatar = (props: { userId: string; className?: string }) => {
  const { userId, className } = props
  const lover = useLoverByUserId(userId)
  const user = useUserById(userId)

  if (!lover || !lover.pinned_url)
    return <EmptyAvatar className={className} size={10} />
  return (
    <Avatar
      className={className}
      avatarUrl={lover.pinned_url}
      username={user?.username}
    />
  )
}

export const MatchTile = (props: {
  profileLover: Lover
  matchUserId: string
}) => {
  const { matchUserId, profileLover } = props
  const lover = useLoverByUserId(matchUserId)
  const user = useUserById(matchUserId)
  const currentUser = useUser()
  const isYourMatch = currentUser?.id === profileLover.user_id

  if (!lover || !user)
    return <Col className="mb-2 h-[184px] w-[200px] shrink-0"></Col>
  const { pinned_url } = lover

  return (
    <Col className="mb-2 w-[200px] shrink-0 overflow-hidden rounded">
      <Col className="bg-canvas-0 w-full px-4 py-2">
        <UserLink
          className={
            'hover:text-primary-500 text-ink-1000 truncate font-semibold transition-colors'
          }
          user={user}
          hideBadge
        />
      </Col>
      <Col className="relative h-36 w-full overflow-hidden">
        {pinned_url ? (
          <Link href={`/${user.username}`}>
            <Image
              src={pinned_url}
              // You must set these so we don't pay an extra $1k/month to vercel
              width={200}
              height={144}
              alt={`${user.username}`}
              className="h-36 w-full object-cover"
            />
          </Link>
        ) : (
          <Col className="bg-ink-300 h-full w-full items-center justify-center">
            <UserIcon className="h-20 w-20" />
          </Col>
        )}
        {isYourMatch && (
          <Col className="absolute right-3 top-2 gap-2">
            <SendMessageButton
              toUser={user}
              currentUser={currentUser}
              circleButton
            />
          </Col>
        )}
      </Col>
    </Col>
  )
}
