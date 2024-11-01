import { USElectionsPage } from 'web/components/elections-page'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { getElectionsPageProps } from 'web/lib/politics/home'
import { ElectionsPageProps } from 'web/public/data/elections-data'
import Custom404 from './404'
import { ENV } from 'common/envs/constants'
import { useTracking } from 'web/hooks/use-tracking'
import { PromotionalPanel } from 'web/components/promotional-panel'
import { SweepiesFlatCoin } from 'web/public/custom-components/sweepiesFlatCoin'

const revalidate = 60

export async function getStaticProps() {
  if (ENV === 'DEV') {
    return {
      props: {},
      revalidate,
    }
  }

  const electionsPageProps = await getElectionsPageProps()
  return {
    props: electionsPageProps,
    revalidate,
  }
}

export default function Pakman(props: ElectionsPageProps) {
  useTracking('pakman page view')

  if (Object.keys(props).length === 0) {
    return <Custom404 />
  }

  return (
    <Page trackPageView="Pakman page">
      <SEO
        title="Pakman Manifold"
        description="The David Pakman Show on Manifold."
        url="/pakman"
      />
      <PromotionalPanel
        darkModeImg={'/pakman/pakman_show_white.png'}
        lightModeImg={'/pakman/pakman_show.png'}
        header={
          <>
            Welcome, from <b>David Pakman</b>
          </>
        }
        description={
          <>
            Referral bonus has been applied. Register today to claim free 3 <SweepiesFlatCoin/> and unlock this
            purchase offer!
          </>
        }
        loginTrackingText="Sign up from /pakman"
      />

      <USElectionsPage {...props} hideTitle />
    </Page>
  )
}
