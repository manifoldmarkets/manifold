import { ElectionReplay } from 'web/components/election-2026/election-replay'
import { REPLAY_COMPARISONS } from 'web/components/election-2026/replay-comparisons'
import type { ReplaySnapshot } from 'web/components/election-2026/replay-model'
import {
  chamberName,
  ChamberScore,
  chamberScores,
  replayChamberMarket,
  replayStory,
  signedPoints,
} from 'web/components/election-2026/replay-scorecard'
import { Page } from 'web/components/layout/page'
import {
  OG_ELECTION_HEIGHT,
  OG_ELECTION_WIDTH,
} from 'web/components/og/og-election'
import { SEO } from 'web/components/SEO'
import { ElectionMapProps, getElectionMapProps } from 'web/lib/politics/home'
import snapshot from 'web/public/data/election-2026-replay.json'

type Props = ElectionMapProps & { scores: ChamberScore[]; latestAt: number }

// The scores come from the same snapshot and comparisons the page plays, and
// each chamber's live resolution, so the headline, cards and share card
// update the moment a control market resolves.
export async function getStaticProps() {
  const mapProps = await getElectionMapProps()
  const scores = chamberScores(
    snapshot as unknown as ReplaySnapshot,
    REPLAY_COMPARISONS,
    {
      senate: replayChamberMarket(mapProps.senateControlContract),
      house: replayChamberMarket(mapProps.houseControlContract),
    }
  )
  // The replay's Latest stop is these markets, as read now.
  return {
    props: { ...mapProps, scores, latestAt: Date.now() },
    revalidate: 300,
  }
}

const scoreLine = (s: ChamberScore) =>
  s.winner
    ? `${chamberName(s.chamber)}: Manifold ${signedPoints(
        s.averagePoints
      )} closer to the result than real money`
    : `${chamberName(s.chamber)}: Manifold had Democrats ${signedPoints(
        s.averagePoints
      )} vs real money`

export default function Election2026(props: Props) {
  const { scores } = props
  const { sawIt, demsAheadEverywhere } = replayStory(scores)
  const ogProps = Object.fromEntries([
    ['sawIt', sawIt ? '1' : ''],
    ...scores.flatMap((s) => [
      [`${s.chamber}Points`, String(s.averagePoints)],
      [`${s.chamber}Winner`, s.winner ?? ''],
      [`${s.chamber}Ahead`, String(s.ahead)],
      [`${s.chamber}Compared`, String(s.compared)],
    ]),
  ])
  const description = demsAheadEverywhere
    ? 'Before the polls closed, Manifold had Democrats further ahead than the real-money markets in both chambers. Replay a week of the 2026 midterms, race by race.'
    : "Replay Manifold's 2026 midterm odds from a week out through election night, beside the real-money markets."
  return (
    <Page trackPageView="election 2026 replay" hideGoogleOneTap>
      <SEO
        title={
          sawIt ? 'Manifold Saw the Midterms Coming' : '2026 Midterms Replay'
        }
        description={description}
        url="/election2026"
        ogProps={{ props: ogProps, endpoint: 'election-replay' }}
        imageSize={{ width: OG_ELECTION_WIDTH, height: OG_ELECTION_HEIGHT }}
        imageAlt={
          scores.length
            ? `Manifold vs real-money prediction markets before the 2026 midterm polls closed. ${scores
                .map(scoreLine)
                .join('. ')}.`
            : 'Manifold vs real-money prediction markets on the 2026 midterms'
        }
      />
      <ElectionReplay {...props} />
    </Page>
  )
}
