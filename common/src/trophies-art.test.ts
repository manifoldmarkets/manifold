import { existsSync } from 'fs'
import { resolve } from 'path'

import {
  RANKED_TROPHY_DEFINITIONS,
  TROPHY_DEFINITIONS,
  TROPHY_RANK_TIERS,
  getTrophyBadgeImagePath,
  getTrophyRankBadgeImagePath,
} from './trophies'

const publicFile = (path: string) =>
  existsSync(resolve(__dirname, '../../web/public' + path))

// Every milestone has badge art (dev-docs/trophies/art-guide.md). The page
// falls back to the emoji, so a missing image would otherwise go unnoticed.
describe('trophy badge art', () => {
  it('exists for every rank tier of every ranked trophy', () => {
    const missing = RANKED_TROPHY_DEFINITIONS.flatMap((def) =>
      TROPHY_RANK_TIERS.map(({ tier }) =>
        getTrophyRankBadgeImagePath(def.id, tier)
      ).filter((path) => !publicFile(path))
    )
    expect(missing).toEqual([])
  })

  it('never uses a rank tier name as a milestone id', () => {
    const rankIds = new Set<string>(TROPHY_RANK_TIERS.map(({ tier }) => tier))
    const clashes = TROPHY_DEFINITIONS.flatMap((def) =>
      def.milestones.filter((m) => rankIds.has(m.id)).map((m) => m.id)
    )
    expect(clashes).toEqual([])
  })

  it('exists for every milestone', () => {
    const missing = TROPHY_DEFINITIONS.flatMap((def) =>
      def.milestones
        .map((m) => getTrophyBadgeImagePath(def.id, m.id))
        .filter(
          (path) => !existsSync(resolve(__dirname, '../../web/public' + path))
        )
    )
    expect(missing).toEqual([])
  })
})
