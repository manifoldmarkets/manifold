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

// Art pending: milestones that show their emoji until badge art is made. Add
// a new milestone here until its WebP lands; the last test below fails if an
// entry is left behind.
const ART_PENDING: readonly string[] = []

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

  // Both ways: a milestone without art must be listed as pending, and a
  // pending entry must be a defined milestone that still has no art.
  it('exists for every milestone except those listed as art pending', () => {
    const withoutArt = TROPHY_DEFINITIONS.flatMap((def) =>
      def.milestones
        .filter((m) => !publicFile(getTrophyBadgeImagePath(def.id, m.id)))
        .map((m) => `${def.id}/${m.id}`)
    )
    expect(withoutArt.sort()).toEqual([...ART_PENDING].sort())
  })
})
