import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Button } from 'web/components/buttons/button'
import { ManifoldLogo } from 'web/components/nav/manifold-logo' // TODO: maybe separate logo?
import { LogoSEO } from 'web/components/LogoSEO'
import { PrivacyAndTerms } from 'web/components/privacy-terms' // TODO: new ToS
import { firebaseLogin } from 'web/lib/firebase/users'

export default function ManifoldLove() {
  return (
    <Page trackPageView={'signed out home page'} hideSidebar>
      <Col className="mx-auto mb-8 w-full gap-8 px-4">
        <Col className="gap-4">
          <Row className="items-center justify-between">
            <ManifoldLogo />
            <LogoSEO />
          </Row>

          <Row className="justify-between rounded-lg p-4">
            <Col className="max-w-2xl gap-2">
              <h1 className="mb-4 text-3xl">
                Choose the future. Predict what happens
              </h1>
              <h1 className="text-2xl">
                Play-money markets. Real-world improvements
              </h1>
              <h1 className="text-lg">
                Create a question on what will your relationship be like, and
                bet on your friends' and other people's dates!
              </h1>
              <h1 className="text-lg">
                Predictions are subsidized by Manifold. One-click sign up.
              </h1>

              <Button
                color="gradient"
                size="2xl"
                className="mt-8 self-start"
                onClick={firebaseLogin}
              >
                Get your matches
              </Button>
            </Col>
            <Col className="hidden sm:flex">
              <img src="/welcome/manipurple.png" width={210} />
            </Col>
          </Row>
        </Col>

        <PrivacyAndTerms />
      </Col>
    </Page>
  )
}
