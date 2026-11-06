import Link from 'next/link'

import type { AccuracyStory } from 'web/lib/politics/elections-2028'
import { track } from 'web/lib/service/analytics'

// The page opens on 2026's result: Manifold against the real-money markets on
// the two chamber-control markets, measured at each checkpoint of the final
// week before polls closed (see /election2026). The headline only makes the
// claim the numbers support (accuracyStory).
// One real-money venue was measured, so the copy says "real money", singular,
// as /election2026 does.
export const ACCURACY_HEADLINE = 'In 2026, Manifold beat real money'

const pts = (n: number) => `${Math.abs(n)} ${Math.abs(n) === 1 ? 'pt' : 'pts'}`

// "Democrats won both." / "Democrats won the Senate; Republicans the House."
function resultLine(story: AccuracyStory) {
  const [a, b] = story.chambers
  if (!a?.winner || !b?.winner) return ''
  const party = (w: 'D' | 'R') => (w === 'D' ? 'Democrats' : 'Republicans')
  if (a.winner === b.winner) return ` ${party(a.winner)} won both.`
  return ` ${party(a.winner)} won the ${a.name}; ${party(b.winner)} the ${
    b.name
  }.`
}

// One line: the claim, each chamber's margin over real money, and a link to
// the replay.
export function AccuracyBanner(props: { story: AccuracyStory }) {
  const { beatRealMoney, chambers } = props.story
  const checkpoints = chambers[0]?.milestones ?? 0
  const margins = chambers
    .map(
      (c) =>
        `${c.name} ${c.points > 0 ? '+' : c.points < 0 ? '−' : ''}${pts(
          c.points
        )}`
    )
    .join(', ')
  return (
    <Link
      href="/election2026"
      onClick={() => track('click election 2026 replay banner')}
      className="text-ink-700 hover:text-ink-900 group flex flex-wrap items-baseline gap-x-1.5 text-sm"
    >
      <span className="text-primary-700 text-xs font-semibold uppercase tracking-wide">
        2026 midterms
      </span>
      <span>
        {beatRealMoney ? ACCURACY_HEADLINE : 'Manifold against real money'}
        {beatRealMoney && margins && checkpoints > 0
          ? ` (${margins}, ${checkpoints}/${checkpoints} checkpoints).`
          : '.'}
        {resultLine(props.story)}
      </span>
      <span className="text-primary-700 font-medium group-hover:underline">
        Replay →
      </span>
    </Link>
  )
}
