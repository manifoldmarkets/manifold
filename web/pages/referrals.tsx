import { Col } from 'web/components/layout/col'
import { SEO } from 'web/components/SEO'
import { useUser } from 'web/hooks/use-user'
import { Page } from 'web/components/layout/page'
import { redirectIfLoggedOut } from 'web/lib/firebase/server-auth'

import { getReferralCodeFromUser } from 'common/util/share'

export const getServerSideProps = redirectIfLoggedOut('/')

export default function ReferralsPage() {
  const user = useUser()
  const isSweepstakesVerified = user?.sweepstakesVerified

  const code = getReferralCodeFromUser(user?.id)
  return (
    <Page trackPageView={'referrals'}>
      <SEO
        title="Refer a friend"
        description={`Invite new users to Manifold!`}
        url="/referrals"
      />

      <Col className="mx-auto max-w-2xl items-center">
        <Col className="bg-canvas-0 rounded-lg p-8 shadow-lg">
          <h1 className="mb-6 text-center text-3xl font-bold">
            Refer a Friend
          </h1>

          <img
            className="mx-auto mb-8 block"
            src="/logo-flapping-with-money.gif"
            width={200}
            height={200}
            alt="Animated logo"
          />

          <div className="text-center text-xl">Coming soon...</div>
        </Col>
      </Col>
    </Page>
  )
}
