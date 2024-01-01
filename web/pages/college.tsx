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
export const getServerSideProps = redirectIfLoggedIn('/chanceme', async (_) => {
  const result = await db
    .from('platform_calibration')
    .select('*')
    .order('created_time', { ascending: false })
    .limit(1)

  const { points, score, n } = result.data?.[0]?.data as any
  return {
    props: { points, score, n },
  }
})
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
}) {
  const { points, score, n } = props
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
  useRedirectIfSignedIn('chanceme')
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
                  className="whitespace-nowrap lg:flex"
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
              <Col className="max-w-xlg gap-1">
                <h1 className="mb-1 text-4xl">
                  <b>The acceptance rate at UCLA is {count.toFixed(1)}%</b>
                </h1>
                <h1 className="text-2xl">
                  But what is <i>your</i> chance of acceptance?
                </h1>
                <br></br>
                <h1 className="text-xl">
                  Using the aggregate wisdom of Manifold's play-money prediction
                  markets, we can find your chance of admission for{' '}
                  <u>any college.</u> It's 100%{' '}
                  <strong className="font-semibold">free, fun,</strong> and{' '}
                  <strong className="font-semibold">easy</strong> to use!
                  {/* It's play money,{' '}
                  <strong className="font-semibold">not crypto</strong>, and
                  free to play. */}
                </h1>
                <br></br>

                <ExpandSection title="What is a prediction market?">
                  Prediction markets are platforms where people bet on the
                  likelihood of future events, and the probabilities reflect the
                  crowd's collective predictions. Participants have a financial
                  incentive to make accurate predictions, encouraging a dynamic
                  exchange of information. This makes prediction markets
                  effective tools for forecasting and decision-making. Overall,
                  prediction markets are valuable because they harness
                  collective wisdom, incentivize accurate predictions, and
                  provide dynamic insights into the likelihood of future events.
                  <Image
                    src="/welcome/manifold-example.gif"
                    className="my-4 h-full w-full object-contain"
                    alt={'Manifold example animation'}
                    width={200}
                    height={100}
                  />
                </ExpandSection>
                <ExpandSection title="How accurate are prediction markets?">
                  Manifold's markets stand apart from resources like CollegeVine
                  or college admission subreddits with their demonstrated
                  accuracy in predicting probabilities. The provided calibration
                  chart evaluates how closely the actual outcomes match
                  Manifold's predictions. Ideally, the blue dots on the chart
                  should align with the diagonal line, indicating precise
                  calibration. For instance, a dot representing a 70% predicted
                  probability indicates that out of similar forecasts, 70%
                  indeed resolved positively, verifying the prediction's
                  accuracy. Overall, Manifold is a well calibrated platform,
                  which means that the probability you have for admissions at a
                  given college should be fairly accurate.
                  <SizedContainer className="aspect-square w-full pb-8 pr-8">
                    {(w, h) => (
                      <CalibrationChart points={points} width={w} height={h} />
                    )}
                  </SizedContainer>
                </ExpandSection>
                <ExpandSection title="Should I make an account if I'm not in 12th grade yet?">
                  Absolutely! Prediction markets are dynamic systems that
                  respond to new information. If you were to create one for
                  college admissions before reaching 12th grade, it would still
                  work well. These markets continuously update as you progress
                  through your academic journey, considering your achievements
                  and experiences. People participating in the market anticipate
                  that your profile will evolve over time, and they make
                  informed guesses based on your current accomplishments and
                  future potential. While your age may be a factor, prediction
                  markets are designed to effectively evaluate possibilities for
                  individuals at different stages of their education.
                </ExpandSection>
                <ExpandSection title="What do the markets look like?">
                  Here is an example of an admissions profile for a hypothetical
                  student:
                  <img
                    src="https://i.imgur.com/L86IE48.png"
                    alt="Example profile"
                  />
                </ExpandSection>
                <ExpandSection title="Will my information be private?">
                  Other users will be able to see your admissions profile and
                  bet on it, as this is a key mechanism of the website. However,
                  you are able to be anonymous and your name will not be shared
                  with any colleges or universities. You are also welcome to
                  provide as little or as much information as you like when you
                  create your profile, although you will get more accurate
                  probabilities the more information you give. Feel free to
                  check out the privacy policy and terms and conditions on the
                  bottom of this page.
                </ExpandSection>
                <hr></hr>
                <h1 className="mt-1 text-xl">
                  College admissions can be stressful, so...
                </h1>
                <Button
                  color="gradient"
                  size="2xl"
                  className="mt-1"
                  onClick={firebaseLogin}
                >
                  Join now to find your chances!
                </Button>
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
