import { useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { TrophyGrid } from 'web/components/trophies/trophy-card'
import { api } from 'web/lib/api/api'
import { ENV, isAdminId } from 'common/envs/constants'
import { useUser } from 'web/hooks/use-user'
import {
  TROPHY_DEFINITIONS,
  CATEGORY_ORDER,
  CATEGORY_LABELS,
  computeAllTrophyProgress,
  countReachedMilestones,
  getTotalPossibleMilestones,
} from 'common/trophies'

// Dev-only stat overrides for testing trophy thresholds
const DEV_PRESETS: Record<string, Record<string, number>> = {
  'Whale trader': {
    totalVolumeMana: 60_000_000,
    totalTradesCount: 30_000,
    longestBettingStreak: 250,
    profitableMarketsCount: 600,
  },
  'Prolific creator': {
    totalMarketsCreated: 600,
    creatorTraders: 6_000,
    numberOfComments: 6_000,
  },
  'Social butterfly': {
    numberOfComments: 12_000,
    totalReferrals: 150,
    charityDonatedMana: 100_000,
  },
  'Max everything': Object.fromEntries(
    TROPHY_DEFINITIONS.map((d) => [
      d.statKey,
      d.milestones[d.milestones.length - 1].threshold * 1.1,
    ])
  ),
}

export function TrophiesTab(props: { userId: string; isOwnProfile: boolean }) {
  const { userId, isOwnProfile } = props

  const { data: achievements, refresh } = useAPIGetter(
    'get-user-achievements',
    { userId }
  )

  const currentUser = useUser()
  const isAdmin = currentUser ? isAdminId(currentUser.id) : false

  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [devOverrides, setDevOverrides] = useState<Record<string, number>>({})
  const [showDevPanel, setShowDevPanel] = useState(false)
  const isDev = ENV !== 'PROD'

  const handleClaim = async (trophyId: string) => {
    setClaimingId(trophyId)
    try {
      await api('claim-trophy', { trophyId })
      refresh()
    } catch (e) {
      console.error('Failed to claim trophy:', e)
    } finally {
      setClaimingId(null)
    }
  }

  const handleUnclaim = async (trophyId: string) => {
    try {
      await api('unclaim-trophy', { trophyId })
      refresh()
    } catch (e) {
      console.error('Failed to unclaim trophy:', e)
    }
  }

  if (!achievements) {
    return (
      <Col className="items-center py-8">
        <div className="text-ink-400 text-sm">Loading trophies...</div>
      </Col>
    )
  }

  // Merge real achievements with dev overrides for local testing
  const effectiveStats = { ...achievements, ...devOverrides }

  const progressList = computeAllTrophyProgress(effectiveStats)
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
      <Col className="gap-1">
        <Row className="items-center gap-2">
          <span className="text-2xl">{'\u{1F3C6}'}</span>
          <span className="text-ink-900 text-lg font-bold">
            {reached} of {total} milestones reached
          </span>
        </Row>
        <span className="text-ink-500 text-sm">
          Earn trophies by trading, creating markets, and being active.
          Claim milestones to pin them on your profile.
        </span>
      </Col>

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
            <TrophyGrid
              progressList={catProgress}
              definitions={defs}
              claimedTrophies={achievements.claimedTrophies}
              isOwnProfile={isOwnProfile}
              onClaim={handleClaim}
              claimingId={claimingId}
            />
          </Col>
        )
      })}

      {/* Admin tools: unclaim trophies */}
      {isAdmin && isOwnProfile && achievements.claimedTrophies.length > 0 && (
        <Col className="border-ink-200 mt-4 gap-2 rounded-lg border border-dashed p-3">
          <span className="text-ink-500 text-xs font-mono">
            [ADMIN] Unclaim trophies
          </span>
          <Row className="flex-wrap gap-2">
            {achievements.claimedTrophies.map((c) => (
              <button
                key={c.trophyId}
                className="rounded bg-red-100 px-2 py-1 text-xs text-red-600 hover:bg-red-200"
                onClick={() => handleUnclaim(c.trophyId)}
              >
                {c.trophyId}: {c.milestone}
              </button>
            ))}
          </Row>
        </Col>
      )}

      {/* Dev-only stat inflator */}
      {isDev && isOwnProfile && (
        <Col className="border-ink-200 mt-4 gap-2 rounded-lg border border-dashed p-3">
          <button
            className="text-ink-500 text-xs font-mono hover:underline"
            onClick={() => setShowDevPanel(!showDevPanel)}
          >
            [DEV] Trophy stat overrides {showDevPanel ? '▲' : '▼'}
          </button>
          {showDevPanel && (
            <Col className="gap-2">
              <Row className="flex-wrap gap-2">
                {Object.keys(DEV_PRESETS).map((preset) => (
                  <button
                    key={preset}
                    className="bg-ink-100 hover:bg-ink-200 rounded px-2 py-1 text-xs"
                    onClick={() => setDevOverrides(DEV_PRESETS[preset])}
                  >
                    {preset}
                  </button>
                ))}
                <button
                  className="rounded bg-red-100 px-2 py-1 text-xs text-red-600 hover:bg-red-200"
                  onClick={() => setDevOverrides({})}
                >
                  Reset
                </button>
              </Row>
              {Object.keys(devOverrides).length > 0 && (
                <div className="text-ink-500 font-mono text-[10px]">
                  Overrides: {JSON.stringify(devOverrides)}
                </div>
              )}
            </Col>
          )}
        </Col>
      )}
    </Col>
  )
}
