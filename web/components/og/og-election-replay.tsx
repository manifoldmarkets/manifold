import Logo from 'web/public/logo.svg'
import {
  OG_ELECTION_HEIGHT,
  OG_ELECTION_WIDTH,
} from 'web/components/og/og-election'

// The /election2026 share card: Manifold against the real-money markets on
// Senate and House control before the polls closed, from the page's own
// scores (ChamberScore), so the card never says more than the page.
export type OgElectionReplayProps = {
  // Per chamber: average points ahead ("4", "-1"), the winner ("D", "R" or
  // "" before the market resolved), and how many milestones were ahead out
  // of how many compared.
  senatePoints?: string
  senateWinner?: string
  senateAhead?: string
  senateCompared?: string
  // "1" when the page's replayStory says Manifold saw it coming.
  sawIt?: string
  housePoints?: string
  houseWinner?: string
  houseAhead?: string
  houseCompared?: string
}

const TEAL = '#0f766e'
const INDIGO = '#4338ca'

const int = (s: string | undefined, min: number, max: number) => {
  if (s === undefined || !/^-?\d{1,3}$/.test(s)) return undefined
  const n = parseInt(s)
  return n >= min && n <= max ? n : undefined
}
const party = (s: string | undefined) =>
  s === 'D' || s === 'R' ? s : undefined

type Score = {
  name: string
  points: number
  winner?: 'D' | 'R'
  ahead?: number
  compared?: number
}

function parseScore(
  name: string,
  points?: string,
  winner?: string,
  ahead?: string,
  compared?: string
): Score | undefined {
  const p = int(points, -100, 100)
  if (p === undefined) return undefined
  return {
    name,
    points: p,
    winner: party(winner),
    ahead: int(ahead, 0, 99),
    compared: int(compared, 1, 99),
  }
}

const signed = (n: number) =>
  `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)} ${
    Math.abs(n) === 1 ? 'pt' : 'pts'
  }`

function ScoreBlock(props: { score: Score; first: boolean }) {
  const { name, points, winner, ahead, compared } = props.score
  const caption = winner
    ? points >= 0
      ? 'closer to the result than real money'
      : 'further from the result than real money'
    : 'more on Democrats than real money'
  return (
    // A fixed width and margin: satori sizes flex children to their content,
    // and ignores the row's gap.
    <div
      className="flex flex-col rounded-3xl"
      style={{
        width: 520,
        marginLeft: props.first ? 0 : 32,
        backgroundColor: '#f8fafc',
        padding: '28px 36px',
      }}
    >
      <span className="flex text-gray-500" style={{ fontSize: 28 }}>
        {`${name} control · ${
          winner
            ? `${winner === 'D' ? 'Democrats' : 'Republicans'} won`
            : 'result pending'
        }`}
      </span>
      <span
        className="flex"
        style={{
          fontSize: 104,
          lineHeight: 1.05,
          color: winner ? TEAL : INDIGO,
        }}
      >
        {`${winner ? '' : 'D '}${signed(points)}`}
      </span>
      <span className="flex text-gray-700" style={{ fontSize: 30 }}>
        {caption}
      </span>
      {ahead !== undefined && compared !== undefined && (
        <span className="mt-3 flex text-gray-500" style={{ fontSize: 24 }}>
          {`${
            winner ? 'Closer' : 'Higher'
          } at ${ahead} of ${compared} milestones`}
        </span>
      )}
    </div>
  )
}

export function OgElectionReplay(props: OgElectionReplayProps) {
  const scores = [
    parseScore(
      'House',
      props.housePoints,
      props.houseWinner,
      props.houseAhead,
      props.houseCompared
    ),
    parseScore(
      'Senate',
      props.senatePoints,
      props.senateWinner,
      props.senateAhead,
      props.senateCompared
    ),
  ].filter((s): s is Score => !!s)
  // The page's own replayStory decides the headline; the card only follows.
  const sawIt = props.sawIt === '1'

  return (
    <div
      className="flex flex-col bg-white"
      style={{
        width: OG_ELECTION_WIDTH,
        height: OG_ELECTION_HEIGHT,
        padding: '48px 64px 40px',
        fontFamily: 'Figtree',
      }}
    >
      <div className="flex w-full flex-row items-center justify-between">
        <div className="flex flex-row items-center">
          <Logo className="mr-2 h-14 w-14" stroke={INDIGO} />
          <span
            className="flex uppercase text-indigo-700"
            style={{ fontSize: 36, fontFamily: 'Figtree-light' }}
          >
            Manifold
          </span>
        </div>
        <span
          className="flex rounded-full text-indigo-700"
          style={{
            fontSize: 24,
            padding: '6px 18px',
            backgroundColor: '#eef2ff',
          }}
        >
          manifold.markets/election2026
        </span>
      </div>

      <div
        className="flex text-gray-900"
        style={{ fontSize: 60, marginTop: 24, lineHeight: 1.1 }}
      >
        {sawIt
          ? 'Manifold saw the midterms coming'
          : 'Manifold vs. the real-money markets'}
      </div>
      <div
        className="flex text-gray-500"
        style={{ fontSize: 28, marginTop: 8 }}
      >
        2026 midterms, from a week out to the polls closing
      </div>

      <div className="flex w-full flex-1 flex-row items-center">
        {scores.map((s, i) => (
          <ScoreBlock key={s.name} score={s} first={i === 0} />
        ))}
        {scores.length === 0 && (
          <div className="flex text-gray-500" style={{ fontSize: 36 }}>
            Replay every race, beside the real-money markets.
          </div>
        )}
      </div>

      <div className="flex text-gray-500" style={{ fontSize: 22 }}>
        Average gap in each party’s chance, in percentage points, at each
        milestone before the polls closed.
      </div>
    </div>
  )
}
