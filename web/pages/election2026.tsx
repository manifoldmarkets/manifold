import { ElectionReplay } from 'web/components/election-2026/election-replay'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { ElectionMapProps, getElectionMapProps } from 'web/lib/politics/home'

export async function getStaticProps() {
  return { props: await getElectionMapProps(), revalidate: 300 }
}

export default function Election2026(props: ElectionMapProps) {
  return (
    <Page trackPageView="election 2026 replay" hideGoogleOneTap>
      <SEO
        title="2026 Midterms Replay"
        description="Replay Manifold's prediction market odds for every 2026 midterm race, from a week before the polls closed through election night."
        url="/election2026"
      />
      <ElectionReplay {...props} />
    </Page>
  )
}
