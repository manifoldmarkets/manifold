import { Contract, getContractsBySlugs } from 'web/lib/firebase/contracts'
import { Page } from 'web/components/page'
import { LandingPagePanel } from 'web/components/landing-page-panel'
import { Col } from 'web/components/layout/col'
import { ManifoldLogo } from 'web/components/nav/manifold-logo'
import { redirectIfLoggedIn } from 'web/lib/firebase/server-auth'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { SEO } from 'web/components/SEO'

export const getServerSideProps = redirectIfLoggedIn('/home', async (_) => {
  // These hardcoded markets will be shown in the frontpage for signed-out users:
  const hotContracts = await getContractsBySlugs([
    'will-max-go-to-prom-with-a-girl',
    'will-ethereum-switch-to-proof-of-st',
    'will-russia-control-the-majority-of',
    'will-elon-musk-buy-twitter-this-yea',
    'will-trump-be-charged-by-the-grand',
    'will-spacex-launch-a-starship-into',
    'who-will-win-the-nba-finals-champio',
    'who-will-be-time-magazine-person-of',
    'will-congress-hold-any-hearings-abo-e21f987033b3',
    'will-at-least-10-world-cities-have',
  ])
  return { props: { hotContracts } }
})

export default function Home(props: { hotContracts: Contract[] }) {
  const { hotContracts } = props

  useSaveReferral()

  return (
    <Page>
      <SEO
        title="Manifold Markets"
        description="Create a play-money prediction market on any topic you care about
            and bet with your friends on what will happen!"
      />
      <div className="px-4 pt-2 md:mt-0 lg:hidden">
        <ManifoldLogo />
      </div>
      <Col className="items-center">
        <Col className="max-w-3xl">
          <LandingPagePanel hotContracts={hotContracts ?? []} />
          {/* <p className="mt-6 text-gray-500">
            View{' '}
            <SiteLink href="/markets" className="font-bold text-gray-700">
              all markets
            </SiteLink>
          </p> */}
        </Col>
      </Col>
    </Page>
  )
}
