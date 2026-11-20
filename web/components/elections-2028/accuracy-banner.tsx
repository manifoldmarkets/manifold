import Link from 'next/link'

import type { AccuracyStory } from 'web/lib/politics/elections-2028'
import { track } from 'web/lib/service/analytics'

// The page opens on 2026's result: Manifold against the real-money markets on
// the two chamber-control markets, measured at each checkpoint of the final
// week before polls closed (see /election2026). The headline only makes the
// claim the numbers support (accuracyStory); the replay has the numbers.
// One real-money venue was measured, so the copy says "real money", singular,
// as /election2026 does.
export const ACCURACY_HEADLINE = 'In 2026, Manifold beat real money'
export const REPLAY_LINK = 'Replay the map as it changed'

export function AccuracyBanner(props: { story: AccuracyStory }) {
  const { beatRealMoney } = props.story
  return (
    <Link
      href="/election2026"
      onClick={() => track('click election 2026 replay banner')}
      className="text-ink-800 hover:text-ink-1000 group flex flex-wrap items-baseline gap-x-2 text-sm"
    >
      <span className="font-medium">
        {beatRealMoney
          ? `${ACCURACY_HEADLINE}.`
          : 'Manifold against real money in 2026.'}
      </span>
      <span className="text-primary-700 font-medium group-hover:underline">
        {REPLAY_LINK} →
      </span>
    </Link>
  )
}
