import { NextRouter, useRouter } from 'next/router'
import Head from 'next/head'

import { removeUndefinedProps } from 'common/util/object'
import { LovePage } from 'love/components/love-page'
import { LoverCommentSection } from 'love/components/lover-comment-section'
import LoverProfileHeader from 'love/components/lover-profile-header'
import { Matches } from 'love/components/matches'
import ProfileCarousel from 'love/components/profile-carousel'
import { useLoverByUser } from 'love/hooks/use-lover'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { SEO } from 'web/components/SEO'
import { useUser } from 'web/hooks/use-user'
import { getUserByUsername, User } from 'web/lib/firebase/users'
import LoverAbout from 'love/components/lover-about'
import { useTracking } from 'web/hooks/use-tracking'
import { LoverAnswers } from 'love/components/answers/lover-answers'
import { SignUpButton } from 'love/components/nav/love-sidebar'
import { BackButton } from 'web/components/contract/back-button'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { getLoveOgImageUrl } from 'common/love/og-image'
import { Lover } from 'common/love/lover'
import { createContext } from 'react'
import { LoverBio } from 'love/components/bio/lover-bio'
import Custom404 from '../404'

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

  useSaveReferral(user, { defaultReferrerUsername: props.username })

  useTracking('view love profile', { username: user?.username })

  const { lover, refreshLover } = useLoverByUser(user ?? undefined)

  if (currentUser === undefined || lover === undefined) return <div></div>
  if (!user) {
    return <Custom404 />
  }
  if (user.isBannedFromPosting) {
    return <div>User is banned</div>
  }

  return (
    <LovePage
      trackPageView={'user page'}
      trackPageProps={{ username: user.username }}
      className={'p-2 sm:pt-0'}
    >
      <SEO
        title={`${user.name} (@${user.username})`}
        description={user.bio ?? ''}
        url={`/${user.username}`}
        image={getLoveOgImageUrl(user, lover)}
      />
      {(user.isBannedFromPosting || user.userDeleted) && (
        <Head>
          <meta name="robots" content="noindex, nofollow" />
        </Head>
      )}
      <BackButton className="-ml-2 mb-2 self-start" />
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
              refreshLover={refreshLover}
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
  refreshLover: () => void
}) {
  const { isCurrentUser, router, user, lover, currentUser, refreshLover } =
    props

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
      {lover.looking_for_matches && <Matches userId={user.id} />}
      <LoverAbout lover={lover} />
      <LoverBio
        isCurrentUser={isCurrentUser}
        lover={lover}
        refreshLover={refreshLover}
      />
      <LoverAnswers isCurrentUser={isCurrentUser} router={router} user={user} />
      <LoverCommentSection
        onUser={user}
        lover={lover}
        currentUser={currentUser}
      />
    </>
  )
}
