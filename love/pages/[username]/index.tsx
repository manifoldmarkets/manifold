import { useState } from 'react'
import Router from 'next/router'
import Head from 'next/head'
import { useRouter } from 'next/router'

import { removeUndefinedProps } from 'common/util/object'
import { LovePage } from 'love/components/love-page'
import { useLoverByUser } from 'love/hooks/use-lover'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { SEO } from 'web/components/SEO'
import { useUser } from 'web/hooks/use-user'
import { getUserByUsername, User } from 'web/lib/firebase/users'
import { useTracking } from 'web/hooks/use-tracking'
import { BackButton } from 'web/components/contract/back-button'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { getLoveOgImageUrl } from 'common/love/og-image'
import { getLoverRow, LoverRow } from 'common/love/lover'
import Custom404 from '../404'
import { db } from 'web/lib/supabase/db'
import { useSaveCampaign } from 'web/hooks/use-save-campaign'
import { useCallReferUser } from 'web/hooks/use-call-refer-user'
import { LoverProfile } from 'love/components/profile/lover-profile'

export const getStaticProps = async (props: {
  params: {
    username: string
  }
}) => {
  const { username } = props.params
  const user = await getUserByUsername(username)
  const lover = user ? await getLoverRow(user.id, db) : null
  return {
    props: removeUndefinedProps({
      user,
      username,
      lover,
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
  lover: LoverRow | null
}) {
  const { user, username } = props
  const router = useRouter()
  const { query } = router
  const fromSignup = query.fromSignup === 'true'

  const currentUser = useUser()
  const isCurrentUser = currentUser?.id === user?.id

  useSaveReferral(currentUser, { defaultReferrerUsername: username })
  useTracking('view love profile', { username: user?.username })
  useSaveCampaign()
  useCallReferUser()

  const [staticLover] = useState(
    props.lover && user ? { ...props.lover, user: user } : null
  )
  const { lover: clientLover, refreshLover } = useLoverByUser(user ?? undefined)
  const lover = clientLover ?? staticLover

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

      {currentUser !== undefined && (
        <Col className={'gap-4'}>
          {lover ? (
            <LoverProfile
              lover={lover}
              user={user}
              refreshLover={refreshLover}
              fromSignup={fromSignup}
            />
          ) : isCurrentUser ? (
            <Col className={'mt-4 w-full items-center'}>
              <Row>
                <Button onClick={() => Router.push('/signup')}>
                  Create a profile
                </Button>
              </Row>
            </Col>
          ) : (
            <Col className="bg-canvas-0 rounded p-4 ">
              <div>{user.name} hasn't created a profile yet.</div>
              <Button
                className="mt-4 self-start"
                onClick={() => Router.push('/')}
              >
                See more profiles
              </Button>
            </Col>
          )}
        </Col>
      )}
    </LovePage>
  )
}
