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

export async function getStaticProps(context: {
  params?: { slug?: string[] }
}) {
  // This is an optional catch-all route, so before this guard every URL under
  // /election/... rendered this same page at HTTP 200 with no canonical tag —
  // an unbounded duplicate-content surface for crawlers. Collapse them onto
  // the canonical URL. A permanent redirect rather than a 404 so any inbound
  // links keep their equity. (/election/needle is a real file-system route and
  // takes precedence over this catch-all, so it is unaffected.)
  const slug = context.params?.slug
  if (slug && slug.length > 0) {
    return { redirect: { destination: '/election', permanent: true } }
  }

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
        title="2026 Midterm Election Odds"
        description="Live prediction market odds for the 2026 US midterms: Senate and House control, every state race, plus Trump approval and the generic ballot."
        url="/election"
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
