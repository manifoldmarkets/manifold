import { USElectionsPage } from 'web/components/elections-page'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { getElectionsPageProps } from 'web/lib/politics/home'
import { ElectionsPageProps } from 'web/public/data/elections-data'
import Custom404 from './404'
import { ENV } from 'common/envs/constants'
import { useTracking } from 'web/hooks/use-tracking'
import { PromotionalPanel } from 'web/components/promotional-panel'

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

export default function WelcomeOffer(props: ElectionsPageProps) {
  useTracking('welcome offer page view')

  if (Object.keys(props).length === 0) {
    return <Custom404 />
  }

  return (
    <Page trackPageView="Welcome offer page">
      <SEO
        title="Welcome offer"
        description="Landing page containing welcome offer for sweepstakes"
        url="/welcomeoffer"
      />
      <PromotionalPanel
        darkModeImg={'/welcome/manipurple.png'}
        lightModeImg={'/welcome/manipurple.png'}
        header={<>Welcome offer applied</>}
        loginTrackingText="sign up from /welcomeoffer"
      />

      <USElectionsPage {...props} hideTitle />
    </Page>
  )
}
