import { ElectionsPageProps } from 'web/public/data/elections-data'
import { getElectionsPageProps } from 'web/lib/politics/home'
import {
  getSenateControlRepPct,
  getSenateOgFills,
} from 'web/lib/politics/election-og'
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
      {/* The share thumbnail is generated from the same market data as the
          page's Senate map (and refreshes with `revalidate`), so it never
          drifts from the shading people see on the page. */}
      <SEO
        title="Manifold Elections"
        description="Live prediction market odds on US elections — the 2028 presidential race and the 2026 midterms"
        ogProps={{
          props: {
            fills: getSenateOgFills(props.rawSenateStateContracts),
            rep: getSenateControlRepPct(props.senateControlContract),
          },
          endpoint: 'election',
        }}
      />

      <USElectionsPage {...props} />
    </Page>
  )
}
