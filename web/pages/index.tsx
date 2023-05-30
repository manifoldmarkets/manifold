import { ReactNode, memo, useEffect, useState } from 'react'
import Router from 'next/router'
import { ChartBarIcon, ScaleIcon } from '@heroicons/react/solid'
import Link from 'next/link'

import { Page } from 'web/components/layout/page'
import { LandingPagePanel } from 'web/components/landing-page-panel'
import { Col } from 'web/components/layout/col'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { useUser } from 'web/hooks/use-user'
import {
  DESTINY_GROUP_SLUGS,
  ENV_CONFIG,
  HOME_BLOCKED_GROUP_SLUGS,
} from 'common/envs/constants'
import { Row } from 'web/components/layout/row'
import TestimonialsPanel from './testimonials-panel'
import { Modal } from 'web/components/layout/modal'
import { Title } from 'web/components/widgets/title'
import { Contract, CPMMBinaryContract } from 'common/contract'
import { ManifoldLogo } from 'web/components/nav/manifold-logo'
import { firebaseLogin } from 'web/lib/firebase/users'
import { Button } from 'web/components/buttons/button'
import { MobileAppsQRCodeDialog } from 'web/components/buttons/mobile-apps-qr-code-button'
import { redirectIfLoggedIn } from 'web/lib/firebase/server-auth'
import { LogoSEO } from 'web/components/LogoSEO'
import { db } from 'web/lib/supabase/db'
import { PrivacyAndTerms } from 'web/components/privacy-terms'
import clsx from 'clsx'
import { ContractCardNew } from 'web/components/contract/contract-card'
import { formatMoney } from 'common/util/format'
import { SiteLink } from 'web/components/widgets/site-link'

const excludedGroupSlugs = HOME_BLOCKED_GROUP_SLUGS.concat(DESTINY_GROUP_SLUGS)

export const getServerSideProps = redirectIfLoggedIn('/home', async (_) => {
  const { data } = await db.from('trending_contracts').select('data').limit(20)
  const contracts = (data ?? []).map((d) => d.data) as Contract[]

  const trendingContracts = contracts
    .filter(
      (c) => !c.groupSlugs?.some((slug) => excludedGroupSlugs.includes(slug))
    )
    .filter((c) => c.coverImageUrl)
    .filter((c) => c.outcomeType !== 'STONK')
    .slice(0, 7)

  return {
    props: { trendingContracts },
  }
})

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
            <LogoSEO />

            <div className="hidden items-center gap-2 lg:flex">
              <SiteLink href="/about">
                <Button color="gray-white" size="xs">
                  About
                </Button>
              </SiteLink>
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
              icon={<ChartBarIcon className="mx-auto h-8 w-8" />}
              text="What is a prediction market?"
              modal={<PredictionMarketExplainer />}
            />

            <InfoCard
              icon={<div className="text-2xl">{ENV_CONFIG.moneyMoniker}</div>}
              text="What is mana?"
              modal={<ManaExplainer />}
            />

            <LinkInfoCard
              link="/markets"
              icon={<ScaleIcon className="mx-auto h-8 w-8" />}
              text="Explore markets"
            />
          </Row>
        </Col>

        <ContractsSection
          contracts={trendingContracts}
          className="w-full self-center"
        />

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
        is Manifold's play money. Use it to create and bet in markets.
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

const ContractsSection = memo(function ContractsSection(props: {
  contracts: Contract[]
  className?: string
}) {
  const { contracts, className } = props
  return (
    <Col className={clsx('max-w-2xl', className)}>
      {contracts.map((contract) => (
        <ContractCardNew key={contract.id} contract={contract} />
      ))}
    </Col>
  )
})
