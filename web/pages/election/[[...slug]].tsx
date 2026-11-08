import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { Elections2028Page } from 'web/components/elections-2028/elections-2028-page'
import { ContentsRail } from 'web/components/elections-2028/contents-nav'
import {
  OG_ELECTION_2028_HEIGHT,
  OG_ELECTION_2028_WIDTH,
  OgElection2028Props,
} from 'web/components/og/og-election-2028'
import { useSaveCampaign } from 'web/hooks/use-save-campaign'
import { getElection2028OgProps } from 'web/lib/politics/election-2028-og'
import { pageContents } from 'web/lib/politics/election-contents'
import { formatOgAsOf } from 'web/lib/politics/election-og'
import {
  Elections2028PageProps,
  getElections2028PageProps,
} from 'web/lib/politics/elections-2028'

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

// The charts' history caches by the hour upstream; two minutes keeps the
// model, movers and market cards fresh without refetching it all every minute.
const revalidate = 120

type Props = Elections2028PageProps & { og: OgElection2028Props }

export async function getStaticProps(context: {
  params?: { slug?: string[] }
}) {
  // This is an optional catch-all route, so every URL under /election/...
  // would otherwise render this page at HTTP 200 with no canonical tag.
  // Collapse them onto the canonical URL (permanently, to keep inbound
  // links' equity). /election/needle is a real route and takes precedence.
  const slug = context.params?.slug
  if (slug && slug.length > 0) {
    return { redirect: { destination: '/election', permanent: true } }
  }

  const props = await getElections2028PageProps()
  return {
    props: {
      ...props,
      og: getElection2028OgProps(props, formatOgAsOf(props.now)),
    },
    revalidate,
  }
}

export default function Elections(props: Props) {
  useSaveCampaign()
  const { og } = props
  const imageAlt =
    og.dem && og.rep
      ? `2028 presidential election odds on Manifold: Democrats ${
          og.dem
        }%, Republicans ${og.rep}%.${
          og.demName && og.demPct
            ? ` Democratic nominee: ${og.demName} ${og.demPct}%.`
            : ''
        }${
          og.repName && og.repPct
            ? ` Republican nominee: ${og.repName} ${og.repPct}%.`
            : ''
        }`
      : '2028 presidential election odds on Manifold'

  return (
    // No Google One Tap: on phones its sign-in sheet covers the page's first
    // screen. Betting still prompts sign-in.
    <Page
      trackPageView="us elections page 2028"
      hideGoogleOneTap
      rightSidebar={<ContentsRail entries={pageContents(props)} />}
    >
      <SEO
        title="2028 Presidential Election Odds"
        description="Live prediction market odds for the 2028 US presidential election: who wins, both parties' nominees, running mates, the electoral map, and every election before it."
        url="/election"
        ogProps={{ props: og, endpoint: 'election-2028' }}
        imageSize={{
          width: OG_ELECTION_2028_WIDTH,
          height: OG_ELECTION_2028_HEIGHT,
        }}
        imageAlt={imageAlt}
      />
      <Elections2028Page {...props} />
    </Page>
  )
}
