import { ElectionsPageProps } from 'web/public/data/elections-data'
import { getElectionsPageProps } from 'web/lib/politics/home'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { USElectionsPage } from 'web/components/elections-page'
import { useSaveCampaign } from 'web/hooks/use-save-campaign'

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}
const revalidate = 60

export async function getStaticProps() {
  const electionsPageProps = await getElectionsPageProps()
  return {
    props: electionsPageProps,
    revalidate,
  }
}

export default function Elections(props: ElectionsPageProps) {
  useSaveCampaign()

  return (
    <Page trackPageView="us midterms page 2026">
      <SEO
        title="Manifold 2026 Midterm Forecast"
        description="Live prediction market odds on the 2026 US midterm elections"
        image="/election-map24.png"
      />

      <USElectionsPage {...props} />
    </Page>
  )
}
