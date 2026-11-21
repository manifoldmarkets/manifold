import { existsSync } from 'fs'
import { resolve } from 'path'

import { TROPHY_DEFINITIONS, getTrophyBadgeImagePath } from './trophies'

// Every milestone has badge art (dev-docs/trophies/art-guide.md). The page
// falls back to the emoji, so a missing image would otherwise go unnoticed.
describe('trophy badge art', () => {
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
