import { ElectionsPageProps } from 'web/public/data/elections-data'
import { getElectionsPageProps } from 'web/lib/politics/home'
import {
  getControlRepPct,
  getSenateOgFills,
  getWhiteHouse2028Probs,
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
      {/* The share thumbnail quotes the same live markets the page shows —
          House/Senate control and the 2028 presidency — and refreshes with
          `revalidate`, so it can't drift from what's on the page. The map
          fills are its fallback visual if the control markets go missing. */}
      <SEO
        title="Manifold Elections"
        description="Live prediction market odds on US elections — the 2028 presidential race and the 2026 midterms"
        ogProps={{
          props: {
            fills: getSenateOgFills(props.rawSenateStateContracts),
            houseRep: getControlRepPct(props.houseControlContract),
            senateRep: getControlRepPct(props.senateControlContract),
            ...getWhiteHouse2028Probs(props.presidency2028PartyContract),
          },
          endpoint: 'election',
        }}
      />

      <USElectionsPage {...props} />
    </Page>
  )
}
