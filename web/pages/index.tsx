import { ReactNode, useState } from 'react'
import Link from 'next/link'

import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { ENV_CONFIG } from 'common/envs/constants'
import { Row } from 'web/components/layout/row'
import TestimonialsPanel from './testimonials-panel'
import { Modal } from 'web/components/layout/modal'
import { Title } from 'web/components/widgets/title'
import { ManifoldLogo } from 'web/components/nav/manifold-logo'
import { firebaseLogin } from 'web/lib/firebase/users'
import { Button } from 'web/components/buttons/button'
import { MobileAppsQRCodeDialog } from 'web/components/buttons/mobile-apps-qr-code-button'
import { redirectIfLoggedIn } from 'web/lib/firebase/server-auth'
import { LogoSEO } from 'web/components/LogoSEO'
import { PrivacyAndTerms } from 'web/components/privacy-terms'
import { formatMoney } from 'common/util/format'
import { SiteLink } from 'web/components/widgets/site-link'
import { NewsTopicsTabs } from 'web/components/news/news-topics-tabs'
import { useRedirectIfSignedIn } from 'web/hooks/use-redirect-if-signed-in'
import { STARTING_BALANCE } from 'common/economy'

export const getServerSideProps = redirectIfLoggedIn('/home')

export default function Home() {
  useSaveReferral()
  useRedirectIfSignedIn()
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <Page>
      <Col className="mx-auto mb-8 w-full gap-8 px-4">
        <Col className="gap-4">
          {/* <Row className="items-center justify-between">
            <ManifoldLogo />
            <LogoSEO />

            <Row className="items-center gap-2">
              <SiteLink href="/about">
                <Button color="gray-white" size="xs">
                  About
                </Button>
              </SiteLink>
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
          </Row> */}

          <Row className="justify-between rounded-lg p-8">
            <Col className="max-w-sm gap-2">
              <h1 className="text-4xl">Predict the future</h1>
              <h1 className="text-lg">
                A new way to get answers to real-world questions and news.
              </h1>
              <h1 className="text-lg">
                Compete and climb the ranks by betting on literally anything.
              </h1>
              <Button
                color="gradient"
                size="2xl"
                className="mt-8"
                onClick={firebaseLogin}
              >
                Play Now!
              </Button>

              <div className="text-sm text-white">
                to get{'   '}
                <span className="relative z-10 font-semibold">
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

export function LinkInfoCard(props: {
  link: string
  icon: ReactNode
  text: string
}) {
  const { link, icon, text } = props
  return (
    <Link
      className="text-ink-700 border-primary-300 hover:border-primary-700 group flex w-1/3 flex-col items-center gap-1 rounded-xl border px-4 py-2 text-center text-sm drop-shadow-sm transition-all"
      href={link}
    >
      <div className="text-primary-300 group-hover:text-primary-700 transition-colors">
        {icon}
      </div>
      <div>
        <span className="text-ink-700">{text}</span>
      </div>
    </Link>
  )
}

export function InfoCard(props: {
  icon: ReactNode
  text: string
  externalLink?: boolean
  modal: ReactNode
}) {
  const { icon, text, modal } = props
  const [open, setOpen] = useState(false)
  return (
    <>
      <Modal open={open} setOpen={setOpen} size="md">
        <Col className="bg-canvas-0 text-ink-1000 rounded-md px-8 py-6 text-sm md:text-lg">
          <Title children={text} />
          {modal}
        </Col>
      </Modal>
      <button
        className="text-ink-700 border-primary-300 hover:border-primary-700 group flex w-1/3 flex-col items-center gap-1 rounded-xl border px-4 py-2 text-center text-sm drop-shadow-sm transition-colors"
        onClick={() => setOpen(true)}
      >
        <div className="text-primary-300 group-hover:text-primary-700 transition-colors">
          {icon}
        </div>
        <div className="text-ink-700">{text}</div>
      </button>
    </>
  )
}

export function ManaExplainer() {
  return (
    <>
      <img
        className="mx-auto mb-8 w-[60%] object-contain"
        src={'/welcome/treasure.png'}
      />
      <div className="text-lg">
        <strong className="semibold mt-4 text-xl">
          Mana ({ENV_CONFIG.moneyMoniker})
        </strong>{' '}
        is Manifold's play money. Use it to create and bet in questions.
      </div>
      <div className={'my-3 text-lg '}>
        Mana can't be converted into cash, but can be purchased and donated to
        charity at a ratio of{' '}
        <strong className="semibold text-xl">{formatMoney(100)} : $1</strong>.
      </div>
    </>
  )
}

export function PredictionMarketExplainer() {
  return (
    <>
      <div className="text-lg">
        Prediction markets let you bet on the outcome of future events.
      </div>
      <div className="mt-2 text-lg">
        On Manifold, you can create your own prediction market on any question
        you want!
      </div>

      <div className="text-ink-400 mt-4 font-semibold">EXAMPLE</div>
      <div className="border-primary-700 bg-primary-50 mb-4 border-l-2 py-2 px-2 text-sm">
        <p className="mt-2">
          <span className="text-primary-700 font-semibold">
            "Will Democrats win the 2024 US presidential election?"
          </span>
        </p>
        <p className="mt-4">
          If I think the Democrats are very likely to win, and you disagree, I
          might offer <b>$70</b> to your <b>$30</b> (with the winner taking home
          <b> $100</b> total).
        </p>
        <p className="mt-4">
          This set of bets implies a <b>70% probability</b> of the Democrats
          winning. As more people bet, the implied probability will converge to
          the questions's best estimate.
        </p>
      </div>
    </>
  )
}
