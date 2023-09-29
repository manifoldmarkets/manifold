import { useState } from 'react'
import Link from 'next/link'
import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { Row } from 'web/components/layout/row'
import { TestimonialsPanel } from 'web/components/testimonials-panel'
import { firebaseLogin } from 'web/lib/firebase/users'
import { Button } from 'web/components/buttons/button'
import { redirectIfLoggedIn } from 'web/lib/firebase/server-auth'
import { PrivacyAndTerms } from 'web/components/privacy-terms'
import { formatMoney } from 'common/util/format'
import { NewsTopicsTabs } from 'web/components/news/news-topics-tabs'
import { useRedirectIfSignedIn } from 'web/hooks/use-redirect-if-signed-in'
import { STARTING_BALANCE } from 'common/economy'
import { ManifoldLogo } from 'web/components/nav/manifold-logo'
import { LogoSEO } from 'web/components/LogoSEO'
import { MobileAppsQRCodeDialog } from 'web/components/buttons/mobile-apps-qr-code-button'
import { useSaveCampaign } from 'web/hooks/use-save-campaign'

export const getServerSideProps = redirectIfLoggedIn('/home')

export default function Home() {
  useSaveReferral()
  useSaveCampaign()
  useRedirectIfSignedIn()
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <Page trackPageView={'signed out home page'} hideSidebar>
      <Col className="mx-auto mb-8 w-full gap-8 px-4">
        <Col className="gap-4">
          <Row className="items-center justify-between">
            <ManifoldLogo />
            <LogoSEO />

            <Row className="items-center gap-2">
              <Link href="/about">
                <Button color="gray-white" size="xs">
                  About
                </Button>
              </Link>
              <Link href="/browse">
                <Button
                  color="gray-white"
                  size="xs"
                  className="hidden whitespace-nowrap lg:flex"
                >
                  Questions
                </Button>
              </Link>
              <Button
                color="gray-white"
                size="xs"
                onClick={() => setIsModalOpen(true)}
                className="hidden whitespace-nowrap lg:flex"
              >
                Get app
              </Button>
              <Button
                color="gray-white"
                size="xs"
                onClick={firebaseLogin}
                className="whitespace-nowrap"
              >
                Sign in
              </Button>
              <Button
                color="indigo"
                size="xs"
                onClick={firebaseLogin}
                className="hidden whitespace-nowrap lg:flex"
              >
                Sign up
              </Button>

              <MobileAppsQRCodeDialog
                isModalOpen={isModalOpen}
                setIsModalOpen={setIsModalOpen}
              />
            </Row>
          </Row>

          <Row className="justify-between rounded-lg p-8">
            <Col className="max-w-lg gap-2">
              <h1 className="mb-4 text-4xl">Predict the future</h1>
              <h1 className="text-lg">
                Play-money markets. Real-world accuracy.
              </h1>
              <h1 className="text-lg">
                Compete with your friends by betting on literally anything.
                Winnings go to{' '}
                <Link href="/charity" className="hover:underline">
                  charity
                </Link>
                . One-click sign up.
              </h1>

              <Button
                color="gradient"
                size="2xl"
                className="mt-8"
                onClick={firebaseLogin}
              >
                Play now
              </Button>

              <div className="text-md ml-8 ">
                ...and get{'   '}
                <span className="z-10 font-semibold">
                  {formatMoney(STARTING_BALANCE)}
                </span>
                {'   '}
                in play money!
              </div>
            </Col>
            <Col className="hidden sm:flex">
              <img src="welcome/manipurple.png" width={220} />
            </Col>
          </Row>
        </Col>

        <NewsTopicsTabs dontScroll />

        <TestimonialsPanel />

        <PrivacyAndTerms />
      </Col>
    </Page>
  )
}
