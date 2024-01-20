import { LoverCommentSection } from 'love/components/lover-comment-section'
import LoverProfileHeader from 'love/components/profile/lover-profile-header'
import { Matches } from 'love/components/matches/matches'
import ProfileCarousel from 'love/components/profile-carousel'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { useUser } from 'web/hooks/use-user'
import { User } from 'web/lib/firebase/users'
import LoverAbout from 'love/components/lover-about'
import { LoverAnswers } from 'love/components/answers/lover-answers'
import { SignUpButton } from 'love/components/nav/love-sidebar'
import { Lover } from 'common/love/lover'
import { LoverBio } from 'love/components/bio/lover-bio'
import {
  LikeData,
  useLikesGivenByUser,
  useLikesReceivedByUser,
} from 'love/hooks/use-likes'
import { LikesDisplay } from '../widgets/likes-display'
import { LikeButton } from '../widgets/like-button'

export function LoverProfile(props: {
  lover: Lover
  user: User
  refreshLover: () => void
  fromLoverPage?: Lover
  fromSignup?: boolean
}) {
  const { lover, user, refreshLover, fromLoverPage, fromSignup } = props

  const currentUser = useUser()
  const isCurrentUser = currentUser?.id === user.id

  const { likesGiven, refreshLikesGiven } = useLikesGivenByUser(user.id)
  const { likesReceived, refreshLikesReceived } = useLikesReceivedByUser(
    user.id
  )
  const refreshLikes = async () => {
    await Promise.all([refreshLikesGiven(), refreshLikesReceived()])
  }

  return (
    <>
      {lover.photo_urls && <ProfileCarousel lover={lover} />}
      <LoverProfileHeader
        user={user}
        lover={lover}
        simpleView={!!fromLoverPage}
        likesReceived={likesReceived ?? []}
        refreshLikes={refreshLikes}
      />
      <LoverContent
        user={user}
        lover={lover}
        refreshLover={refreshLover}
        fromLoverPage={fromLoverPage}
        fromSignup={fromSignup}
        likesGiven={likesGiven ?? []}
        likesReceived={likesReceived ?? []}
      />
      {((!fromLoverPage && !isCurrentUser) ||
        (fromLoverPage && fromLoverPage.user_id === currentUser?.id)) && (
        <Row className="sticky bottom-[70px] right-0 mr-1 self-end lg:bottom-6">
          <LikeButton
            className="shadow"
            targetId={user.id}
            liked={
              !!currentUser &&
              !!likesReceived &&
              likesReceived.map((l) => l.userId).includes(currentUser.id)
            }
            refresh={refreshLikes}
          />
        </Row>
      )}
    </>
  )
}

function LoverContent(props: {
  user: User
  lover: Lover
  refreshLover: () => void
  fromLoverPage?: Lover
  fromSignup?: boolean
  likesGiven: LikeData[]
  likesReceived: LikeData[]
}) {
  const {
    user,
    lover,
    refreshLover,
    fromLoverPage,
    fromSignup,
    likesGiven,
    likesReceived,
  } = props
  const currentUser = useUser()
  const isCurrentUser = currentUser?.id === user.id

  if (!currentUser) {
    return (
      <Col className="bg-canvas-0 w-full gap-4 rounded p-4">
        <Col className="relative gap-4">
          <div className="bg-ink-200 dark:bg-ink-400 h-4 w-2/5" />
          <div className="bg-ink-200 dark:bg-ink-400 h-4 w-3/5" />
          <div className="bg-ink-200 dark:bg-ink-400 h-4 w-1/2" />
          <div className="from-canvas-0 absolute bottom-0 h-12 w-full bg-gradient-to-t to-transparent" />
        </Col>
        <Row className="gap-2">
          <SignUpButton text="Sign up to see profile" />
        </Row>
      </Col>
    )
  }
  return (
    <>
      {likesGiven && likesReceived && (
        <LikesDisplay
          likesGiven={likesGiven}
          likesReceived={likesReceived}
          profileLover={lover}
        />
      )}
      {!fromLoverPage && lover.looking_for_matches && (
        <Matches profileLover={lover} profileUserId={user.id} />
      )}
      <LoverAbout lover={lover} />
      <LoverBio
        isCurrentUser={isCurrentUser}
        lover={lover}
        refreshLover={refreshLover}
        fromLoverPage={fromLoverPage}
      />
      <LoverAnswers
        isCurrentUser={isCurrentUser}
        user={user}
        fromSignup={fromSignup}
        fromLoverPage={fromLoverPage}
        lover={lover}
      />
      <LoverCommentSection
        onUser={user}
        lover={lover}
        currentUser={currentUser}
        simpleView={!!fromLoverPage}
      />
    </>
  )
}
