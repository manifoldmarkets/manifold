import { orderBy, keyBy } from 'lodash'
import { LikeData } from 'love/hooks/use-likes'
import { useLoverByUserId } from 'love/hooks/use-lover'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Avatar, EmptyAvatar } from 'web/components/widgets/avatar'
import { useUserById } from 'web/hooks/use-user-supabase'

export const LikesDisplay = (props: {
  likesGiven: LikeData[]
  likesReceived: LikeData[]
}) => {
  const { likesGiven, likesReceived } = props

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
  const onlyLikesGiven = likesGiven.filter(
    (l) => !likesRecievedByUserId[l.userId]
  )
  const onlyLikesReceived = likesReceived.filter(
    (l) => !likesGivenByUserId[l.userId]
  )

  return (
    <Col className="gap-2">
      {mutualLikes.length > 0 && (
        <LikesList label="Mutual likes" likes={mutualLikes} />
      )}
      <LikesList label={`Likes given`} likes={onlyLikesGiven} />
      <LikesList label="Liked by" likes={onlyLikesReceived} />
    </Col>
  )
}

const LikesList = (props: { label: string; likes: LikeData[] }) => {
  const { label, likes } = props

  const maxShown = 10
  const sortedLikes = orderBy(likes, 'createdTime', 'desc').slice(0, maxShown)

  return (
    <Row className="h-10 items-center gap-2">
      <div className="text-lg">{label}</div>
      <Row>
        {sortedLikes.map((like) => (
          <UserAvatar key={like.userId} userId={like.userId} />
        ))}
        {sortedLikes.length === 0 && (
          <div className="text-ink-500 text-lg">none</div>
        )}
      </Row>
    </Row>
  )
}

const UserAvatar = (props: { userId: string }) => {
  const { userId } = props
  const lover = useLoverByUserId(userId)
  const user = useUserById(userId)

  if (!lover || !lover.pinned_url) return <EmptyAvatar size={10} />
  return <Avatar avatarUrl={lover.pinned_url} username={user?.username} />
}
