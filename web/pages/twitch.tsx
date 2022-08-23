import { Page } from 'web/components/page'
import { Col } from 'web/components/layout/col'
import { ManifoldLogo } from 'web/components/nav/manifold-logo'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { SEO } from 'web/components/SEO'
import { Spacer } from 'web/components/layout/spacer'
import { firebaseLogin } from 'web/lib/firebase/users'
import { withTracking } from 'web/lib/service/analytics'
import { Row } from 'web/components/layout/row'
import { Button } from 'web/components/button'
import { useTracking } from 'web/hooks/use-tracking'

export default function TwitchLandingPage() {
  useSaveReferral()
  useTracking('view twitch landing page')

  return (
    <Page>
      <SEO
        title="Manifold Markets on Twitch"
        description="Get more out of Twitch with play-money betting markets."
      />
      <div className="px-4 pt-2 md:mt-0 lg:hidden">
        <ManifoldLogo />
      </div>
      <Col className="items-center">
        <Col className="max-w-3xl">
          <Col className="mb-6 rounded-xl sm:m-12 sm:mt-0">
            <Row className="self-center">
              <img height={200} width={200} src="/twitch-logo.png" />
              <img height={200} width={200} src="/flappy-logo.gif" />
            </Row>
            <div className="m-4 max-w-[550px] self-center">
              <h1 className="text-3xl sm:text-6xl xl:text-6xl">
                <div className="font-semibold sm:mb-2">
                  <span className="bg-gradient-to-r from-indigo-500 to-blue-500 bg-clip-text font-bold text-transparent">
                    Bet
                  </span>{' '}
                  on your favorite streams
                </div>
              </h1>
              <Spacer h={6} />
              <div className="mb-4 px-2 ">
                Get more out of Twitch with play-money betting markets. Click
                the button below to link your Twitch account.
                <br />
              </div>
            </div>
            <Spacer h={6} />
            <Button
              size="2xl"
              color="gradient"
              className="self-center"
              onClick={withTracking(firebaseLogin, 'twitch page button click')}
            >
              Get started
            </Button>
          </Col>
        </Col>
      </Col>
    </Page>
  )
}
