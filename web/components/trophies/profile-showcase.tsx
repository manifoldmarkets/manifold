import clsx from 'clsx'
import { useState, useCallback } from 'react'

import { RanksType } from 'common/achievements'
import { DIVISION_NAMES } from 'common/leagues'
import { type User } from 'common/user'
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
  detail: string
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

function tierFromPercentile(pct: number | null): ShowcaseBadgeData['tier'] {
  if (pct == null) return 'gray'
  if (pct <= 1) return 'prismatic'
  if (pct <= 3) return 'gold'
  if (pct <= 5) return 'crimson'
  if (pct <= 10) return 'purple'
  if (pct <= 25) return 'blue'
  if (pct <= 50) return 'green'
  return 'gray'
}

function tierFromRank(rank: number | null): ShowcaseBadgeData['tier'] {
  if (rank == null) return 'gray'
  if (rank <= 10) return 'prismatic'
  if (rank <= 25) return 'gold'
  if (rank <= 50) return 'crimson'
  if (rank <= 100) return 'purple'
  if (rank <= 250) return 'blue'
  if (rank <= 500) return 'green'
  return 'gray'
}

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
// Badge generation: from achievements API (when available)
// ---------------------------------------------------------------------------

function generateBadgesFromAchievements(
  achievements: {
    longestBettingStreak: number
    charityDonatedMana: number
    seasonsMasters: number
    accountAgeYears: number
    ranks: RanksType
  },
): ShowcaseBadgeData[] {
  const badges: ShowcaseBadgeData[] = []
  const r = achievements.ranks

  if (r.volume.rank != null && r.volume.rank <= 500) {
    badges.push({
      id: 'rank-volume',
      label: `#${r.volume.rank} Volume`,
      detail: `#${r.volume.rank} in all-time trading volume`,
      emoji: '\u{1F4B0}',
      tier: tierFromRank(r.volume.rank),
    })
  }

  if (r.trades.rank != null && r.trades.rank <= 500) {
    badges.push({
      id: 'rank-trades',
      label: `#${r.trades.rank} Trader`,
      detail: `#${r.trades.rank} in total trades placed`,
      emoji: '\u{1F4C8}',
      tier: tierFromRank(r.trades.rank),
    })
  }

  if (r.profitableMarkets.percentile != null && r.profitableMarkets.percentile <= 25) {
    badges.push({
      id: 'rank-profit',
      label: `Top ${Math.ceil(r.profitableMarkets.percentile)}% Wins`,
      detail: `Top ${Math.ceil(r.profitableMarkets.percentile)}% in number of profitable markets`,
      emoji: '\u{1F3AF}',
      tier: tierFromPercentile(r.profitableMarkets.percentile),
    })
  }

  if (r.marketsCreated.rank != null && r.marketsCreated.rank <= 500) {
    badges.push({
      id: 'rank-creator',
      label: `#${r.marketsCreated.rank} Creator`,
      detail: `#${r.marketsCreated.rank} in markets created`,
      emoji: '\u{1F3D7}',
      tier: tierFromRank(r.marketsCreated.rank),
    })
  }

  if (r.creatorTraders.rank != null && r.creatorTraders.rank <= 500) {
    badges.push({
      id: 'rank-popular-creator',
      label: `#${r.creatorTraders.rank} Popular Creator`,
      detail: `#${r.creatorTraders.rank} in unique traders attracted`,
      emoji: '\u{2B50}',
      tier: tierFromRank(r.creatorTraders.rank),
    })
  }

  if (achievements.longestBettingStreak >= 14) {
    badges.push({
      id: 'streak',
      label: `${achievements.longestBettingStreak}-Day Streak`,
      detail: `Longest prediction streak: ${achievements.longestBettingStreak} days`,
      emoji: '\u{1F525}',
      tier:
        achievements.longestBettingStreak >= 365 ? 'prismatic' :
        achievements.longestBettingStreak >= 200 ? 'gold' :
        achievements.longestBettingStreak >= 100 ? 'crimson' :
        achievements.longestBettingStreak >= 60 ? 'purple' :
        achievements.longestBettingStreak >= 30 ? 'blue' :
        'green',
    })
  }

  if (r.totalReferrals.rank != null && r.totalReferrals.rank <= 250) {
    badges.push({
      id: 'rank-referrals',
      label: `#${r.totalReferrals.rank} Recruiter`,
      detail: `#${r.totalReferrals.rank} in referrals`,
      emoji: '\u{1F91D}',
      tier: tierFromRank(r.totalReferrals.rank),
    })
  }

  if (r.comments.rank != null && r.comments.rank <= 500) {
    badges.push({
      id: 'rank-comments',
      label: `#${r.comments.rank} Commenter`,
      detail: `#${r.comments.rank} in total comments`,
      emoji: '\u{1F4AC}',
      tier: tierFromRank(r.comments.rank),
    })
  }

  if (achievements.charityDonatedMana >= 1000) {
    badges.push({
      id: 'charity',
      label: `$${Math.floor(achievements.charityDonatedMana).toLocaleString()} Donated`,
      detail: `Donated $${achievements.charityDonatedMana.toLocaleString()} to charity`,
      emoji: '\u{2764}',
      tier: tierFromPercentile(r.charityDonated.percentile),
    })
  }

  if (achievements.seasonsMasters >= 1) {
    badges.push({
      id: 'masters-seasons',
      label: `${achievements.seasonsMasters}x Masters`,
      detail: `Reached Masters division ${achievements.seasonsMasters} time${achievements.seasonsMasters > 1 ? 's' : ''}`,
      emoji: '\u{1F451}',
      tier:
        achievements.seasonsMasters >= 7 ? 'prismatic' :
        achievements.seasonsMasters >= 5 ? 'gold' :
        achievements.seasonsMasters >= 3 ? 'purple' :
        'blue',
    })
  }

  if (achievements.accountAgeYears >= 2) {
    badges.push({
      id: 'veteran',
      label: `${Math.floor(achievements.accountAgeYears)}yr Veteran`,
      detail: `${Math.floor(achievements.accountAgeYears)}-year Manifold veteran`,
      emoji: '\u{1F396}',
      tier:
        achievements.accountAgeYears >= 5 ? 'gold' :
        achievements.accountAgeYears >= 3 ? 'purple' :
        'blue',
    })
  }

  return badges
}

// ---------------------------------------------------------------------------
// Badge generation: from User object (always available, no API needed)
// ---------------------------------------------------------------------------

function generateBadgesFromUser(user: User): ShowcaseBadgeData[] {
  const badges: ShowcaseBadgeData[] = []

  // Account age — always show for accounts over 30 days
  const ageYears = (Date.now() - user.createdTime) / (365.25 * 24 * 60 * 60 * 1000)
  const ageDays = Math.floor(ageYears * 365.25)
  if (ageYears >= 1) {
    badges.push({
      id: 'veteran',
      label: `${Math.floor(ageYears)}yr Veteran`,
      detail: `${Math.floor(ageYears)}-year Manifold veteran`,
      emoji: '\u{1F396}',
      tier:
        ageYears >= 5 ? 'gold' :
        ageYears >= 3 ? 'purple' :
        ageYears >= 2 ? 'blue' :
        'green',
    })
  } else if (ageDays >= 30) {
    badges.push({
      id: 'veteran',
      label: `${ageDays}d Member`,
      detail: `Manifold member for ${ageDays} days`,
      emoji: '\u{1F396}',
      tier: 'gray',
    })
  }

  // Current streak
  const streak = user.currentBettingStreak ?? 0
  if (streak >= 3) {
    badges.push({
      id: 'streak',
      label: `${streak}-Day Streak`,
      detail: `Current prediction streak: ${streak} days`,
      emoji: '\u{1F525}',
      tier:
        streak >= 365 ? 'prismatic' :
        streak >= 200 ? 'gold' :
        streak >= 100 ? 'crimson' :
        streak >= 60 ? 'purple' :
        streak >= 30 ? 'blue' :
        streak >= 14 ? 'green' :
        'gray',
    })
  }

  // Creator popularity (allTime unique traders)
  const allTimeTraders = user.creatorTraders?.allTime ?? 0
  if (allTimeTraders >= 10) {
    badges.push({
      id: 'creator-traders',
      label: `${allTimeTraders >= 1000 ? `${(allTimeTraders / 1000).toFixed(1)}K` : allTimeTraders} Traders`,
      detail: `${allTimeTraders.toLocaleString()} unique traders on your markets`,
      emoji: '\u{2B50}',
      tier:
        allTimeTraders >= 10000 ? 'prismatic' :
        allTimeTraders >= 5000 ? 'gold' :
        allTimeTraders >= 1000 ? 'crimson' :
        allTimeTraders >= 500 ? 'purple' :
        allTimeTraders >= 100 ? 'blue' :
        allTimeTraders >= 50 ? 'green' :
        'gray',
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
  user: User
  isOwnProfile: boolean
}) {
  const { userId, user, isOwnProfile } = props

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
    (id: string) => {
      setPinnedIds((prev: string[] | null) => {
        const current = prev ?? []
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

  // 1. From achievements API (best data — has global rankings)
  if (achievements) {
    for (const b of generateBadgesFromAchievements(achievements)) {
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

  // 3. From User object (always available — fallback when APIs fail)
  for (const b of generateBadgesFromUser(user)) {
    if (!seenIds.has(b.id)) {
      seenIds.add(b.id)
      allBadges.push(b)
    }
  }

  // Sort by tier quality (best first)
  const tierOrder = ['prismatic', 'gold', 'crimson', 'purple', 'blue', 'green', 'gray']
  allBadges.sort((a, b) => tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier))

  if (allBadges.length === 0) return null

  const badgeMap = new Map(allBadges.map((b) => [b.id, b]))

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
                onClick={() => togglePin(b.id)}
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
