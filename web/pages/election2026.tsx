import type {
  ElectionLeaderboard,
  ElectionLeaderboardKey,
} from 'common/election-leaderboards'
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
import { ElectionLeaderboards } from 'web/components/elections-2028/election-leaderboards'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import {
  OG_ELECTION_HEIGHT,
  OG_ELECTION_WIDTH,
} from 'web/components/og/og-election'
import { SEO } from 'web/components/SEO'
import { recap2026Scopes } from 'web/lib/politics/election-leaderboard-scopes'
import { ElectionMapProps, getElectionMapProps } from 'web/lib/politics/home'
import { getStoredLeaderboards } from 'web/lib/politics/stored-leaderboards'
import snapshot from 'web/public/data/election-2026-replay.json'

type Props = ElectionMapProps & {
  scores: ChamberScore[]
  latestAt: number
  leaderboards: ElectionLeaderboard[]
  leaderboardDefault: ElectionLeaderboardKey
}

// The scores come from the same snapshot and comparisons the page plays, and
// each chamber's live resolution, so the headline, cards and share card
// update the moment a control market resolves.
export async function getStaticProps() {
  const [mapProps, storedBoards] = await Promise.all([
    getElectionMapProps(),
    getStoredLeaderboards(),
  ])
  const { boards, defaultKey } = recap2026Scopes(storedBoards)
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
    props: {
      ...mapProps,
      scores,
      latestAt: Date.now(),
      leaderboards: boards,
      leaderboardDefault: defaultKey,
    },
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
      <ElectionReplay
        {...props}
        footer={
          props.leaderboards.length > 0 && (
            <section
              className="mt-4 flex flex-col gap-3"
              aria-labelledby="leaderboards"
            >
              <Col className="gap-1">
                <h2
                  id="leaderboards"
                  className="text-primary-700 text-xl font-semibold sm:text-2xl"
                >
                  Leaderboards
                </h2>
                <p className="text-ink-600 text-sm">
                  Who made the most on the 2026 election markets, and whose
                  markets drew the most traders.
                </p>
              </Col>
              <ElectionLeaderboards
                boards={props.leaderboards}
                defaultKey={props.leaderboardDefault}
                page="election2026"
              />
            </section>
          )
        }
      />
    </Page>
  )
}
