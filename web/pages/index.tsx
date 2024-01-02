import { memo, useState } from 'react'
import Link from 'next/link'
import clsx from 'clsx'

import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { Row } from 'web/components/layout/row'
import { TestimonialsPanel } from 'web/components/testimonials-panel'
import { firebaseLogin } from 'web/lib/firebase/users'
import { Button } from 'web/components/buttons/button'
import { redirectIfLoggedIn } from 'web/lib/firebase/server-auth'
import { AboutPrivacyTerms } from 'web/components/privacy-terms'
import { formatMoney } from 'common/util/format'
import { useRedirectIfSignedIn } from 'web/hooks/use-redirect-if-signed-in'
import { STARTING_BALANCE } from 'common/economy'
import { ManifoldLogo } from 'web/components/nav/manifold-logo'
import { LogoSEO } from 'web/components/LogoSEO'
import { MobileAppsQRCodeDialog } from 'web/components/buttons/mobile-apps-qr-code-button'
import { useSaveCampaign } from 'web/hooks/use-save-campaign'
import { FeedContractCard } from 'web/components/contract/feed-contract-card'
import { CPMMBinaryContract, Contract } from 'common/contract'
import { db } from 'web/lib/supabase/db'
import { DEEMPHASIZED_GROUP_SLUGS } from 'common/envs/constants'
import { useUser } from 'web/hooks/use-user'
import { some } from 'd3-array'

const excluded = [...DEEMPHASIZED_GROUP_SLUGS, 'manifold-6748e065087e']

export const getServerSideProps = redirectIfLoggedIn('/home', async (_) => {
  const { data } = await db
    .from('trending_contracts')
    .select('data')
    .neq('outcome_type', 'STONK')
    .gt('data->uniqueBettorCount', 10)
    .limit(50)
  const contracts = (data ?? []).map((d) => d.data) as Contract[]
  const filteredContracts = contracts.filter(
    (c) => !c.groupSlugs?.some((slug) => excluded.includes(slug as any))
  )

  const hasCommonGroupSlug = (contract: Contract, groupSlugsSet: string[]) =>
    some(contract.groupSlugs ?? [], (slug) => groupSlugsSet.includes(slug))

  const addedGroupSlugs: string[] = []
  const uniqueContracts: Contract[] = []
  filteredContracts.forEach((contract) => {
    if (!hasCommonGroupSlug(contract, addedGroupSlugs)) {
      uniqueContracts.push(contract)
      addedGroupSlugs.push(...(contract.groupSlugs ?? []))
    }
  })
  return {
    props: { trendingContracts: uniqueContracts.slice(0, 7) },
  }
})

export default function LandingPage(props: {
  trendingContracts: CPMMBinaryContract[]
}) {
  const { trendingContracts } = props

  const user = useUser()
  useSaveReferral(user)
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
                  Markets
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
                Compete with your friends by betting on literally anything. It's
                play money,{' '}
                <strong className="font-semibold">not crypto</strong>, and free
                to play.
              </h1>

              <Button
                color="gradient"
                size="2xl"
                className="mt-8"
                onClick={firebaseLogin}
              >
                Start predicting
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
              <img
                src="welcome/manipurple.png"
                width={220}
                alt={'manifold logo'}
              />
            </Col>
          </Row>
        </Col>

        <ContractsSection
          contracts={trendingContracts}
          className="w-full self-center"
        />

        <TestimonialsPanel />

        <AboutPrivacyTerms />
      </Col>
    </Page>
  )
}

const ContractsSection = memo(function ContractsSection(props: {
  contracts: Contract[]
  className?: string
}) {
  const { contracts, className } = props
  return (
    <Col className={clsx('max-w-2xl gap-4', className)}>
      {contracts.map((contract) => (
        <FeedContractCard key={contract.id} contract={contract} />
      ))}
    </Col>
  )
})
