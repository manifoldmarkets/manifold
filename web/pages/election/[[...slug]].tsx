import { getElectionsPageProps, MidtermsPageProps } from 'web/lib/politics/home'
import { formatOgAsOf, getElectionOgProps } from 'web/lib/politics/election-og'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { USElectionsPage } from 'web/components/elections-page'
import {
  OG_ELECTION_HEIGHT,
  OG_ELECTION_WIDTH,
} from 'web/components/og/og-election'
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
    props: {
      ...electionsPageProps,
      // When the share card's odds were read (this revalidation).
      ogAsOf: formatOgAsOf(Date.now()),
    },
    revalidate,
  }
}

export default function Elections(
  props: MidtermsPageProps & { ogAsOf: string }
) {
  useSaveCampaign()

  const ogProps = getElectionOgProps({
    houseControlContract: props.houseControlContract,
    senateControlContract: props.senateControlContract,
    asOf: props.ogAsOf,
  })
  const imageAlt =
    ogProps.houseRep && ogProps.senateRep
      ? `2026 midterms live odds: House control Democrats ${
          100 - Number(ogProps.houseRep)
        }%, Republicans ${ogProps.houseRep}%. Senate control Democrats ${
          100 - Number(ogProps.senateRep)
        }%, Republicans ${ogProps.senateRep}%.`
      : '2026 midterms live odds on Manifold'

  return (
    // No Google One Tap here: on phones its sign-in sheet covered the map
    // legend on first load, which is most of the launch audience's first
    // impression. Betting still prompts sign-in.
    <Page
      trackPageView="us midterms page 2026"
      className="lg:col-span-10"
      hideGoogleOneTap
    >
      {/* The share card quotes the same live control markets the page shows,
          plus when it read them, and refreshes with `revalidate`, so it
          can't drift from what's on the page. 1200x630 for X's
          summary_large_image. */}
      <SEO
        title="2026 Midterm Election Odds"
        description="Live prediction market odds for the 2026 US midterms: Senate and House control, every state race, plus Trump approval and the generic ballot."
        url="/election"
        ogProps={{ props: ogProps, endpoint: 'election' }}
        imageSize={{ width: OG_ELECTION_WIDTH, height: OG_ELECTION_HEIGHT }}
        imageAlt={imageAlt}
      />

      <USElectionsPage {...props} />
    </Page>
  )
}
