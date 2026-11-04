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

export function AccuracyBanner(props: { story: AccuracyStory }) {
  const { beatRealMoney, chambers } = props.story
  const checkpoints = chambers[0]?.milestones ?? 0
  return (
    <Link
      href="/election2026"
      onClick={() => track('click election 2026 replay banner')}
      className="from-primary-50 to-canvas-0 border-primary-200 group relative block overflow-hidden rounded-2xl border bg-gradient-to-br p-4 transition-shadow hover:shadow-md sm:p-5"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex max-w-xl flex-col gap-1.5">
          <span className="text-primary-700 text-xs font-semibold uppercase tracking-wider">
            2026 midterms
          </span>
          <h2 className="text-ink-1000 text-xl font-semibold leading-snug sm:text-2xl">
            {beatRealMoney
              ? ACCURACY_HEADLINE
              : 'Replay the 2026 midterms against real money'}
          </h2>
          <p className="text-ink-700 text-sm sm:text-base">
            {beatRealMoney
              ? `At all ${checkpoints} checkpoints in the final week, Manifold was closer to the results than real-money trading, in both the Senate and the House.${resultLine(
                  props.story
                )}`
              : 'Watch Manifold and real-money trading, checkpoint by checkpoint, from a week out to election night.'}
          </p>
          <span className="text-primary-700 mt-1 text-sm font-semibold group-hover:underline">
            Watch the 2026 replay →
          </span>
        </div>
        {chambers.length > 0 && (
          <div className="flex gap-3">
            {chambers.map((c) => (
              <div
                key={c.chamber}
                className="bg-canvas-0 border-ink-200 flex min-w-[8.5rem] flex-col rounded-xl border px-4 py-3"
              >
                <span className="text-ink-600 text-xs font-medium">
                  {c.name}
                </span>
                <span className="text-ink-1000 text-3xl font-semibold">
                  {c.points > 0 ? '+' : c.points < 0 ? '−' : ''}
                  {pts(c.points)}
                </span>
                <span className="text-ink-600 text-xs">
                  {!c.resolved
                    ? 'vs real money'
                    : c.points >= 0
                    ? 'closer than real money'
                    : 'further than real money'}
                  , {c.ahead}/{c.compared} checkpoints
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Link>
  )
}
