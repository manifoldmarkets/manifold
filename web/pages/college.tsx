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
import { some } from 'd3-array'
import { DailyStats } from 'web/components/home/daily-stats'
import { Spacer } from 'web/components/layout/spacer'
import { ProfileSummary } from 'web/components/nav/profile-summary'
import Welcome from 'web/components/onboarding-college/welcome-college'
import { Title } from 'web/components/widgets/title'
import { useIsClient } from 'web/hooks/use-is-client'
import { useUser } from 'web/hooks/use-user'
import { FeedTimeline } from 'web/components/feed-timeline'
import { api } from 'web/lib/firebase/api'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { Headline } from 'common/news'
import Image from 'next/image'
import { HeadlineTabs } from 'web/components/dashboard/header'
import { SizedContainer } from 'web/components/sized-container'
import { CalibrationChart } from 'web/pages/calibration'
import { ExpandSection } from 'web/components/explainer-panel'
export const getServerSideProps = redirectIfLoggedIn(
  '/create-college',
  async (_) => {
    const { data } = await db
      .from('contracts')
      .select('data')
      .contains('group_slugs', ['college-admissions'])
      .neq('outcome_type', 'STONK')
      .limit(50)
    const contracts = (data ?? []).map((d) => d.data) as Contract[]
    contracts.sort((a, b) => b.uniqueBettorCount - a.uniqueBettorCount)
    const trendingContracts = contracts.slice(0, 7)
    const result = await db
      .from('platform_calibration')
      .select('*')
      .order('created_time', { ascending: false })
      .limit(1)

    const { points, score, n } = result.data?.[0]?.data as any
    console.log(points)
    return {
      props: { points, score, n, trendingContracts },
    }
  }
)
// export async function getStaticProps() {
//   const headlines = await api('headlines', {})
//   return {
//     props: {
//       headlines,
//       revalidate: 30 * 60, // 4 hours
//     },
//   }
// }
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function College(props: {
  points: { x: number; y: number }[]
  score: number
  n: number
  trendingContracts: CPMMBinaryContract[]
}) {
  const { points, score, n, trendingContracts } = props
  const router = useRouter()
  const user = useUser()
  const [count, setCount] = useState<number>(0)
  useEffect(() => {
    const interval = setInterval(() => {
      setCount((prevCount) => {
        // Increment count until it reaches 12, then clear the interval
        if (prevCount < 8.7) {
          return prevCount + 0.1
        } else {
          clearInterval(interval)
          return prevCount
        }
      })
    }, 10)

    // Clean up the interval when the component is unmounted
    return () => clearInterval(interval)
  }, []) // Empty dependency array ensures the effect runs once on mount

  useSaveReferral(user, { defaultReferrerUsername: 'cc6' }) //I can have credit for it, right?
  useSaveCampaign()
  useRedirectIfSignedIn('create-college')
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <>
      <Page trackPageView={'signed out home page'} hideSidebar>
        <Col className="mx-auto mb-8 w-full gap-8 px-4">
          <Col className="gap-4">
            <Row className="items-center justify-between">
              <ManifoldLogo />
              <LogoSEO />

              <Row className="items-center gap-2">
                <MobileAppsQRCodeDialog
                  isModalOpen={isModalOpen}
                  setIsModalOpen={setIsModalOpen}
                />
              </Row>
            </Row>

            <Row className="justify-between rounded-lg p-8">
              <Col className="max-w-xlg gap-1">
                <h1 className="mb-1 text-4xl">
                  <b>The acceptance rate at UCLA is {count.toFixed(1)}%</b>
                </h1>
                <h1 className="text-2xl">
                  But what is <i>your</i> chance of acceptance?
                </h1>
                <br></br>
                <h1 className="text-xl">
                  Using the power of Manifold's play-money prediction markets,
                  we can find your chance of admission for any college. It's
                  100% <strong className="font-semibold">free, fun,</strong> and{' '}
                  <strong className="font-semibold">easy</strong> to use!
                  {/* It's play money,{' '}
                  <strong className="font-semibold">not crypto</strong>, and
                  free to play. */}
                </h1>
                <br></br>

                <ExpandSection title="What is a prediction market?">
                  A prediction market is like a betting game where people trade
                  virtual shares based on what they think will happen in the
                  future, such as college admissions results. These trades
                  generate a probability for the market resolving to YES. This
                  works well because many people with different ideas and
                  information join in, and as they trade, the prices tend to
                  reflect what's likely to really happen. So, prediction markets
                  are like a smart crowd making predictions by buying and
                  selling shares.
                  <Image
                    src="/welcome/manifold-example.gif"
                    className="my-4 h-full w-full object-contain"
                    alt={'Manifold example animation'}
                    width={200}
                    height={100}
                  />
                </ExpandSection>
                <ExpandSection title="How accurate are prediction markets?">
                  Unlike websites like Collegevine or subreddits like chanceme
                  and ApplyingToCollege, Manifold's markets have a lot of
                  evidence behind their probabilities.
                  <br></br>
                  <br></br>
                  This calibration chart shows whether events happened as often
                  as Manifold's markets predict. We want to blue dots to be as
                  close to the diagonal line as possible! A dot with a question
                  probability of 70% means we have a group of markets that were
                  predicted to have a 70% chance of occurring. If our
                  predictions are perfectly calibrated, then 70% of those
                  markets should have resolved yes and it should appear on the
                  y-axis at 70%.
                  <br></br>
                  <br></br>
                  Overall, Manifold is a well calibrated platform, which means
                  that the probability you have for admissions at a given
                  college should be fairly accurate.
                  <SizedContainer className="aspect-square w-full pb-8 pr-8">
                    {(w, h) => (
                      <CalibrationChart points={points} width={w} height={h} />
                    )}
                  </SizedContainer>
                </ExpandSection>
                <ExpandSection title="What do the markets look like?">
                  Here is an example of an admissions profile for a hypothetical
                  student:
                  <img
                    src="https://i.imgur.com/bnVdH3F.png"
                    alt="Example profile"
                  />
                </ExpandSection>

                <Button
                  color="gradient"
                  size="2xl"
                  className="mt-8"
                  onClick={firebaseLogin}
                >
                  Find your chances
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
            </Row>
          </Col>

          {/* <ContractsSection
            contracts={trendingContracts}
            className="w-full self-center"
          /> */}

          <AboutPrivacyTerms />
        </Col>
      </Page>
    </>
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
