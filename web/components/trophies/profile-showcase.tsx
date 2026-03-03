import clsx from 'clsx'
import { useState, useCallback } from 'react'

import { DIVISION_NAMES } from 'common/leagues'
import {
  TROPHY_DEFINITIONS,
  TROPHY_TIER_STYLES,
  computeAllTrophyProgress,
  formatTrophyValue,
} from 'common/trophies'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Tooltip } from 'web/components/widgets/tooltip'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useLeagueInfo } from 'web/hooks/use-leagues'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ShowcaseBadgeData = {
  id: string
  label: string
  stat?: string // e.g. "2.3M" — shown inline after label
  detail: string // tooltip text
  emoji: string
  tier: 'gray' | 'green' | 'blue' | 'purple' | 'crimson' | 'gold' | 'prismatic'
}

const TIER_STYLES: Record<
  ShowcaseBadgeData['tier'],
  { gradient: string; text: string }
> = {
  gray: { gradient: 'from-zinc-400 to-zinc-500', text: 'text-zinc-600' },
  green: { gradient: 'from-emerald-400 to-emerald-600', text: 'text-emerald-600' },
  blue: { gradient: 'from-sky-400 to-blue-600', text: 'text-blue-600' },
  purple: { gradient: 'from-violet-400 to-purple-600', text: 'text-violet-600' },
  crimson: { gradient: 'from-red-500 to-rose-700', text: 'text-red-600' },
  gold: { gradient: 'from-amber-400 to-yellow-600', text: 'text-amber-600' },
  prismatic: { gradient: 'from-pink-400 via-cyan-400 to-yellow-400', text: 'text-purple-600' },
}

// ---------------------------------------------------------------------------
// Tier assignment helpers
// ---------------------------------------------------------------------------

function leagueTier(division: number): ShowcaseBadgeData['tier'] {
  if (division >= 6) return 'prismatic'
  if (division >= 5) return 'gold'
  if (division >= 4) return 'purple'
  if (division >= 3) return 'blue'
  if (division >= 2) return 'green'
  return 'gray'
}

const LEAGUE_EMOJI: Record<number, string> = {
  0: '\u{1F4A0}',
  1: '\u{1F949}',
  2: '\u{1F948}',
  3: '\u{1F947}',
  4: '\u{2B50}',
  5: '\u{1F48E}',
  6: '\u{1F451}',
}

// ---------------------------------------------------------------------------
// Badge generation: from trophy milestones (the cool ones)
// ---------------------------------------------------------------------------

function generateBadgesFromTrophies(
  stats: Record<string, unknown>
): ShowcaseBadgeData[] {
  const progressList = computeAllTrophyProgress(stats)
  const badges: ShowcaseBadgeData[] = []

  for (const progress of progressList) {
    if (!progress.highestMilestone) continue
    const def = TROPHY_DEFINITIONS.find((d) => d.id === progress.trophyId)
    if (!def) continue

    const m = progress.highestMilestone
    badges.push({
      id: `trophy-${def.id}`,
      label: m.name,
      stat: formatTrophyValue(def, progress.currentValue),
      detail: `${def.label}: ${formatTrophyValue(def, progress.currentValue)} ${def.unit}`,
      emoji: m.emoji,
      tier: m.tier,
    })
  }

  return badges
}

// ---------------------------------------------------------------------------
// Badge generation: from league data
// ---------------------------------------------------------------------------

function generateLeagueBadge(
  league: { division: number; rank: number; season: number }
): ShowcaseBadgeData | null {
  if (league.division < 2) return null
  const divName = DIVISION_NAMES[league.division] ?? 'Unknown'
  return {
    id: 'league',
    label: `${divName} S${league.season}`,
    detail: `${divName} Division, Rank #${league.rank} — Season ${league.season}`,
    emoji: LEAGUE_EMOJI[league.division] ?? '\u{1F3C6}',
    tier: leagueTier(league.division),
  }
}

// ---------------------------------------------------------------------------
// Badge UI
// ---------------------------------------------------------------------------

function ShowcaseBadge(props: {
  badge: ShowcaseBadgeData
  onClick?: () => void
  selected?: boolean
  size?: 'sm' | 'lg'
}) {
  const { badge, onClick, selected, size = 'sm' } = props
  const style = TIER_STYLES[badge.tier]
  const isLarge = size === 'lg'

  return (
    <Tooltip text={badge.detail}>
      <button
        className={clsx(
          'relative rounded-lg border p-[1.5px] transition-all',
          onClick && 'cursor-pointer hover:scale-105',
          selected
            ? 'ring-primary-500 ring-2 ring-offset-1'
            : 'border-transparent'
        )}
        onClick={onClick}
      >
        <div
          className={clsx(
            'rounded-[5px] bg-gradient-to-br',
            style.gradient
          )}
        >
          <Row
            className={clsx(
              'items-center gap-1.5 rounded-[4px]',
              isLarge ? 'px-3 py-2' : 'px-2 py-1'
            )}
            style={{
              background:
                'linear-gradient(135deg, rgb(var(--color-canvas-0) / 0.88), rgb(var(--color-canvas-0) / 0.94))',
            }}
          >
            <span className={isLarge ? 'text-lg' : 'text-sm'}>
              {badge.emoji}
            </span>
            <span
              className={clsx(
                'font-semibold',
                isLarge ? 'text-sm' : 'text-xs',
                style.text
              )}
            >
              {badge.label}
            </span>
            {badge.stat && (
              <span
                className={clsx(
                  'text-ink-500 font-normal',
                  isLarge ? 'text-xs' : 'text-[10px]'
                )}
              >
                {badge.stat}
              </span>
            )}
          </Row>
        </div>
      </button>
    </Tooltip>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const MAX_PINNED = 3

export function ProfileShowcase(props: {
  userId: string
  isOwnProfile: boolean
}) {
  const { userId, isOwnProfile } = props

  // Try to fetch achievements (may fail if MVs don't exist locally)
  const { data: achievements } = useAPIGetter('get-user-achievements', {
    userId,
  })
  const league = useLeagueInfo(userId)

  // null = "never configured" (auto-show top badges), [] = "user cleared all"
  const [pinnedIds, setPinnedIds] = usePersistentLocalState<string[] | null>(
    null,
    `showcase-pins-${userId}`
  )
  const [showPicker, setShowPicker] = useState(false)

  const togglePin = useCallback(
    (id: string, validIds: Set<string>) => {
      setPinnedIds((prev: string[] | null) => {
        // Filter out stale IDs from old badge system
        const current = (prev ?? []).filter((x: string) => validIds.has(x))
        if (current.includes(id)) return current.filter((x: string) => x !== id)
        if (current.length >= MAX_PINNED) return current
        return [...current, id]
      })
    },
    [setPinnedIds]
  )

  // Build badges from whatever data sources are available
  const allBadges: ShowcaseBadgeData[] = []
  const seenIds = new Set<string>()

  // 1. From trophy milestones (the exciting ones)
  if (achievements) {
    for (const b of generateBadgesFromTrophies(achievements)) {
      if (!seenIds.has(b.id)) {
        seenIds.add(b.id)
        allBadges.push(b)
      }
    }
  }

  // 2. From league info
  if (league) {
    const lb = generateLeagueBadge({
      division: league.division,
      rank: league.rank,
      season: league.season,
    })
    if (lb && !seenIds.has(lb.id)) {
      seenIds.add(lb.id)
      allBadges.push(lb)
    }
  }

  // Sort by tier quality (best first)
  const tierOrder = ['prismatic', 'gold', 'crimson', 'purple', 'blue', 'green', 'gray']
  allBadges.sort((a, b) => tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier))

  if (allBadges.length === 0) return null

  const badgeMap = new Map(allBadges.map((b) => [b.id, b]))
  const validIdSet = new Set(badgeMap.keys())

  // null = never configured → auto-show top 2; [] = user cleared all → show nothing
  const effectivePins =
    pinnedIds === null
      ? allBadges.slice(0, 2).map((b) => b.id)
      : pinnedIds.filter((id) => badgeMap.has(id))

  const pinnedBadges = effectivePins
    .map((id) => badgeMap.get(id))
    .filter(Boolean) as ShowcaseBadgeData[]

  return (
    <>
      <Row className="flex-wrap items-center gap-1.5">
        {pinnedBadges.map((b) => (
          <ShowcaseBadge
            key={b.id}
            badge={b}
            onClick={isOwnProfile ? () => setShowPicker(true) : undefined}
          />
        ))}
        {isOwnProfile && effectivePins.length < MAX_PINNED && (
          <button
            className="border-ink-300 hover:border-ink-400 rounded-lg border border-dashed px-2 py-1 transition-colors"
            onClick={() => setShowPicker(!showPicker)}
          >
            <span className="text-ink-400 text-xs">+ Pin</span>
          </button>
        )}
      </Row>

      {isOwnProfile && showPicker && (
        <Col className="bg-canvas-0 border-ink-200 mt-2 gap-3 rounded-xl border p-4">
          <Row className="items-center justify-between">
            <span className="text-ink-900 text-sm font-bold">
              Pin a trophy to your profile
            </span>
            <button
              className="text-ink-500 text-xs hover:underline"
              onClick={() => setShowPicker(false)}
            >
              Done
            </button>
          </Row>
          <div className="flex flex-wrap gap-2">
            {allBadges.map((b) => (
              <ShowcaseBadge
                key={b.id}
                badge={b}
                size="lg"
                onClick={() => togglePin(b.id, validIdSet)}
                selected={effectivePins.includes(b.id)}
              />
            ))}
          </div>
          <span className="text-ink-500 text-xs">
            Select up to {MAX_PINNED}. Click a pinned badge to remove it.
          </span>
        </Col>
      )}
    </>
  )
}
