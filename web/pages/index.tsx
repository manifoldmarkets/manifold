import {
  Contract,
  getContractsBySlugs,
  getTrendingContracts,
} from 'web/lib/firebase/contracts'
import { Page } from 'web/components/page'
import { LandingPagePanel } from 'web/components/landing-page-panel'
import { Col } from 'web/components/layout/col'
import { ManifoldLogo } from 'web/components/nav/manifold-logo'
import { redirectIfLoggedIn } from 'web/lib/firebase/server-auth'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { SEO } from 'web/components/SEO'

export const getServerSideProps = redirectIfLoggedIn('/home', async (_) => {
  const hotContracts = await getTrendingContracts()
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
