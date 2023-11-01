import { NextRouter, useRouter } from 'next/router'
import Head from 'next/head'

import { removeUndefinedProps } from 'common/util/object'
import { LovePage } from 'love/components/love-page'
import { LoverCommentSection } from 'love/components/lover-comment-section'
import LoverProfileHeader from 'love/components/lover-profile-header'
import { Matches } from 'love/components/matches'
import ProfileCarousel from 'love/components/profile-carousel'
import { Lover, useLoverByUser } from 'love/hooks/use-lover'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { SEO } from 'web/components/SEO'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin, getUserByUsername, User } from 'web/lib/firebase/users'
import LoverAbout from 'love/components/lover-about'
import { useUserAnswersAndQuestions } from 'love/hooks/use-questions'
import { useTracking } from 'web/hooks/use-tracking'
import { loveOgImageUrl } from 'love/pages/api/og/utils'
import { LoverAnswers } from 'love/components/lover-answers'
import { SignUpButton } from 'love/components/nav/love-sidebar'

export const getStaticProps = async (props: {
  params: {
    username: string
  }
}) => {
  const { username } = props.params
  const user = await getUserByUsername(username)
  return {
    props: removeUndefinedProps({
      user,
      username,
    }),
    revalidate: 15,
  }
}

export const getStaticPaths = () => {
  return { paths: [], fallback: 'blocking' }
}

export default function UserPage(props: {
  user: User | null
  username: string
}) {
  const { user } = props
  const currentUser = useUser()
  const isCurrentUser = currentUser?.id === user?.id
  const router = useRouter()

  useTracking('view love profile', { username: user?.username })

  const lover = useLoverByUser(user ?? undefined)

  if (currentUser === undefined || lover === undefined) return <div></div>
  if (!user) {
    return <div>404</div>
  }
  if (user.isBannedFromPosting) {
    return <div>User is banned</div>
  }

  return (
    <LovePage
      key={user.id}
      trackPageView={'user page'}
      trackPageProps={{ username: user.username }}
      className={'p-2'}
    >
      <SEO
        title={`${user.name} (@${user.username})`}
        description={user.bio ?? ''}
        url={`/${user.username}`}
        image={loveOgImageUrl(user, lover)}
      />
      {(user.isBannedFromPosting || user.userDeleted) && (
        <Head>
          <meta name="robots" content="noindex, nofollow" />
        </Head>
      )}
      <Col className={'gap-4'}>
        {lover ? (
          <>
            {lover.photo_urls && (
              <ProfileCarousel lover={lover} currentUser={currentUser} />
            )}
            <LoverProfileHeader
              isCurrentUser={isCurrentUser}
              currentUser={currentUser}
              user={user}
              lover={lover}
              router={router}
            />
            <LoverContent
              isCurrentUser={isCurrentUser}
              router={router}
              user={user}
              lover={lover}
              currentUser={currentUser}
            />
          </>
        ) : isCurrentUser ? (
          <Col className={'mt-4 w-full items-center'}>
            <Row>
              <Button onClick={() => router.push('signup')}>
                Create a profile
              </Button>
            </Row>
          </Col>
        ) : (
          <Col className="bg-canvas-0 rounded p-4 ">
            <div>{user.name} hasn't created a profile yet.</div>
            <Button
              className="mt-4 self-start"
              onClick={() => router.push('/')}
            >
              See more profiles
            </Button>
          </Col>
        )}
      </Col>
    </LovePage>
  )
}

function LoverContent(props: {
  isCurrentUser: boolean
  router: NextRouter
  user: User
  lover: Lover
  currentUser: User | null
}) {
  const { isCurrentUser, router, user, lover, currentUser } = props

  const { questions, answers: allAnswers } = useUserAnswersAndQuestions(
    user?.id
  )

  const answers = allAnswers.filter(
    (a) => a.multiple_choice ?? a.free_response ?? a.integer
  )

  if (!currentUser) {
    return (
      <Col className="bg-canvas-0 w-full gap-4 rounded p-4">
        <Col className="relative gap-4">
          <div className="bg-ink-200 dark:bg-ink-400 h-4 w-2/5" />
          <div className="bg-ink-200 dark:bg-ink-400 h-4 w-3/5" />
          <div className="bg-ink-200 dark:bg-ink-400 h-4 w-1/2" />
          <div className="from-canvas-0 absolute bottom-0 h-12 w-full bg-gradient-to-t to-transparent" />
        </Col>
        <SignUpButton text="Sign up to see more" />
      </Col>
    )
  }
  return (
    <>
      {lover.looking_for_matches && <Matches userId={user.id} />}
      <LoverAbout lover={lover} />
      <LoverAnswers
        isCurrentUser={isCurrentUser}
        answers={answers}
        router={router}
        questions={questions}
      />
      <LoverCommentSection
        onUser={user}
        lover={lover}
        currentUser={currentUser}
      />
    </>
  )
}
