import { ReactNode, useEffect, useState } from 'react'
import Router from 'next/router'
import { ChartBarIcon } from '@heroicons/react/solid'
import Link from 'next/link'

import { Page } from 'web/components/layout/page'
import { LandingPagePanel } from 'web/components/landing-page-panel'
import { Col } from 'web/components/layout/col'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { useUser } from 'web/hooks/use-user'
import { SearchSection } from './home'
import { Sort } from 'web/components/contract-search'
import {
  DESTINY_GROUP_SLUGS,
  ENV_CONFIG,
  HOME_BLOCKED_GROUP_SLUGS,
} from 'common/envs/constants'
import { Row } from 'web/components/layout/row'
import TestimonialsPanel from './testimonials-panel'
import GoToIcon from 'web/lib/icons/go-to-icon'
import { Modal } from 'web/components/layout/modal'
import { Title } from 'web/components/widgets/title'
import { CPMMBinaryContract } from 'common/contract'
import { getTrendingContracts } from 'web/lib/firebase/contracts'
import { ManifoldLogo } from 'web/components/nav/manifold-logo'
import { firebaseLogin } from 'web/lib/firebase/users'
import { Button } from 'web/components/buttons/button'
import { MobileAppsQRCodeDialog } from 'web/components/buttons/mobile-apps-qr-code-button'

const excluded = HOME_BLOCKED_GROUP_SLUGS.concat(DESTINY_GROUP_SLUGS)

export const getStaticProps = async () => {
  const contracts = await getTrendingContracts(20)

  const trendingContracts = contracts.filter(
    (c) => !c.groupSlugs?.some((slug) => excluded.includes(slug))
  )

  return {
    props: { trendingContracts },
    revalidate: 10 * 60, // every 10 minutes
  }
}

export default function Home(props: {
  trendingContracts: CPMMBinaryContract[]
}) {
  useSaveReferral()
  useRedirectAfterLogin()

  const [isModalOpen, setIsModalOpen] = useState(false)

  const { trendingContracts } = props

  return (
    <Page hideSidebar>
      <Col className="mx-auto mb-8 w-full gap-8 px-4">
        <Col className="gap-4">
          <Row className="items-center justify-between">
            <ManifoldLogo />

            <div className="hidden items-center gap-2 lg:flex">
              <Button
                color="gray-white"
                size="xs"
                onClick={() => setIsModalOpen(true)}
              >
                Get app
              </Button>
              <Button color="gray-white" size="xs" onClick={firebaseLogin}>
                Sign in
              </Button>
              <Button color="indigo" size="xs" onClick={firebaseLogin}>
                Sign up
              </Button>

              <MobileAppsQRCodeDialog
                isModalOpen={isModalOpen}
                setIsModalOpen={setIsModalOpen}
              />
            </div>
          </Row>

          <LandingPagePanel />

          <Row className="w-full gap-2 sm:gap-4">
            <InfoCard
              link="https://help.manifold.markets/introduction-to-manifold-markets/what-are-prediction-markets"
              icon={<ChartBarIcon className="mx-auto h-8 w-8" />}
              text="What is a prediction market?"
              modal={<PredictionMarketExplainer />}
            />

            <InfoCard
              link="https://help.manifold.markets/introduction-to-manifold-markets/what-is-mana-m"
              icon={<div className="text-2xl">{ENV_CONFIG.moneyMoniker}</div>}
              text="What is mana?"
              modal={<ManaExplainer />}
            />

            <ExternalInfoCard
              link="https://help.manifold.markets/"
              icon={<div className="text-2xl">?</div>}
              text="Learn more"
            />
          </Row>
        </Col>

        <SearchSection
          key={'score'}
          label={'Trending'}
          contracts={trendingContracts}
          sort={'score' as Sort}
          icon={'🔥'}
        />

        <TestimonialsPanel />
      </Col>
    </Page>
  )
}

export function ExternalInfoCard(props: {
  link: string
  icon: ReactNode
  text: string
}) {
  const { link, icon, text } = props
  return (
    <Link
      className="group flex w-1/3 flex-col items-center gap-1 rounded-xl bg-indigo-700 px-4 py-2 text-center text-sm text-white drop-shadow-sm transition-all hover:drop-shadow-lg"
      href={link}
      target="_blank"
    >
      <div className="text-indigo-400 transition-colors group-hover:text-white">
        {icon}
      </div>
      <div>
        {text}
        <span>
          <GoToIcon className="mb-1 ml-2 inline h-4 w-4 text-white" />
        </span>
      </div>
    </Link>
  )
}

export function InfoCard(props: {
  link: string
  icon: ReactNode
  text: string
  externalLink?: boolean
  modal: ReactNode
}) {
  const { link, icon, text, externalLink, modal } = props
  const [open, setOpen] = useState(false)
  return (
    <>
      <Modal open={open} setOpen={setOpen} size="md">
        <Col className="rounded-md bg-white px-8 py-6 text-sm font-light md:text-lg">
          <Title children={text} />
          {modal}
          <Link
            href={link}
            className="mt-2 text-indigo-700 underline"
            target="_blank"
          >
            Learn more{' '}
            <span>
              <GoToIcon className="mb-1 ml-1 inline h-4 w-4 text-indigo-700" />
            </span>
          </Link>
        </Col>
      </Modal>
      <button
        className="group flex w-1/3 flex-col items-center gap-1 rounded-xl bg-indigo-700 px-4 py-2 text-center text-sm text-white drop-shadow-sm transition-all hover:drop-shadow-lg"
        onClick={() => setOpen(true)}
      >
        <div className="text-indigo-400 transition-colors group-hover:text-white">
          {icon}
        </div>
        <div>
          <div>{text}</div>
          {externalLink && (
            <span>
              <GoToIcon className="mb-1 ml-2 inline h-4 w-4 text-indigo-400" />
            </span>
          )}
        </div>
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
      <div>
        <span className="mt-4 font-normal text-indigo-700">
          Mana ({ENV_CONFIG.moneyMoniker})
        </span>{' '}
        is Manifold's play money. Use it to create and bet in markets. The more
        mana you have, the more you can bet and move the market.
      </div>
      <div className="mt-4">
        Mana <strong>can't be converted to real money</strong>.
      </div>
    </>
  )
}

export function PredictionMarketExplainer() {
  return (
    <>
      <p>
        Prediction markets allow you to bet on the outcome of future events. On
        Manifold, anyone can create their own prediction market about any
        question they want!
      </p>
      <div className="mt-4 font-semibold text-gray-400">EXAMPLE</div>
      <div className="mb-4 border-l-2 border-indigo-700 bg-indigo-50 py-2 px-2">
        <p className="mt-2">
          <span className="font-semibold text-indigo-700">
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
          the market's best estimate.
        </p>
      </div>
    </>
  )
}

const useRedirectAfterLogin = () => {
  const user = useUser()

  useEffect(() => {
    if (user) {
      Router.replace('/home')
    }
  }, [user])
}
