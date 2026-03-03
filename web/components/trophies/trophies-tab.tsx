import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { TrophyGrid } from 'web/components/trophies/trophy-card'
import {
  TROPHY_DEFINITIONS,
  CATEGORY_ORDER,
  CATEGORY_LABELS,
  computeAllTrophyProgress,
  countReachedMilestones,
  getTotalPossibleMilestones,
} from 'common/trophies'

export function TrophiesTab(props: { userId: string }) {
  const { userId } = props

  const { data: achievements } = useAPIGetter('get-user-achievements', {
    userId,
  })

  if (!achievements) {
    return (
      <Col className="items-center py-8">
        <div className="text-ink-400 text-sm">Loading trophies...</div>
      </Col>
    )
  }

  const progressList = computeAllTrophyProgress(achievements)
  const reached = countReachedMilestones(progressList)
  const total = getTotalPossibleMilestones()

  const progressMap = new Map(progressList.map((p) => [p.trophyId, p]))

  // Group definitions by category
  const byCategory = new Map<string, typeof TROPHY_DEFINITIONS>()
  for (const cat of CATEGORY_ORDER) byCategory.set(cat, [])
  for (const def of TROPHY_DEFINITIONS)
    byCategory.get(def.category)?.push(def)

  return (
    <Col className="gap-6 pt-4">
      {/* Hero summary */}
      <Row className="items-center gap-2">
        <span className="text-2xl">{'\u{1F3C6}'}</span>
        <span className="text-ink-900 text-lg font-bold">
          {reached} of {total} milestones reached
        </span>
      </Row>

      {/* Categories */}
      {CATEGORY_ORDER.map((category) => {
        const defs = byCategory.get(category)
        if (!defs?.length) return null
        const catProgress = defs
          .map((d) => progressMap.get(d.id))
          .filter(Boolean) as typeof progressList

        return (
          <Col key={category} className="gap-3">
            <div className="text-ink-800 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider">
              {CATEGORY_LABELS[category]}
              <span className="bg-ink-200 h-px flex-1" />
            </div>
            <TrophyGrid progressList={catProgress} definitions={defs} />
          </Col>
        )
      })}
    </Col>
  )
}
