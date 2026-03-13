import clsx from 'clsx'
import { useState, useCallback, useEffect, useRef } from 'react'

import { DIVISION_NAMES } from 'common/leagues'
import {
  TROPHY_DEFINITIONS,
  computeAllTrophyProgress,
  formatTrophyValue,
} from 'common/trophies'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Tooltip } from 'web/components/widgets/tooltip'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useLeagueInfo } from 'web/hooks/use-leagues'
import { api } from 'web/lib/api/api'

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
  stats: Record<string, unknown>,
  claimedTrophies: { trophyId: string; milestone: string }[]
): ShowcaseBadgeData[] {
  const claimedMap = new Map(claimedTrophies.map((c) => [c.trophyId, c.milestone]))
  const progressList = computeAllTrophyProgress(stats)
  const progressMap = new Map(progressList.map((p) => [p.trophyId, p]))
  const badges: ShowcaseBadgeData[] = []

  for (const def of TROPHY_DEFINITIONS) {
    const claimedMilestoneName = claimedMap.get(def.id)
    if (!claimedMilestoneName) continue
    const m = def.milestones.find((ms) => ms.name === claimedMilestoneName)
    if (!m) continue

    const currentValue = progressMap.get(def.id)?.currentValue ?? m.threshold

    badges.push({
      id: `trophy-${def.id}`,
      label: m.name,
      stat: formatTrophyValue(def, currentValue),
      detail: `${def.label}: ${formatTrophyValue(def, currentValue)} ${def.unit}`,
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

  // Fetch achievements (includes showcasePins from server)
  const { data: achievements, refresh } = useAPIGetter('get-user-achievements', {
    userId,
  })
  const league = useLeagueInfo(userId)

  // Local optimistic state for pins — undefined = not yet loaded
  const [localPins, setLocalPins] = useState<string[] | null | undefined>(
    undefined
  )
  // Server returns null (no row), [] (explicitly cleared), or string[] (has pins)
  const serverPins = achievements ? achievements.showcasePins : undefined
  const initializedRef = useRef(false)

  // Sync server pins to local state once on load
  useEffect(() => {
    if (serverPins !== undefined && !initializedRef.current) {
      initializedRef.current = true
      setLocalPins(serverPins)

      // One-time migration: if server has no pins (null) but localStorage does, push to server
      if (isOwnProfile && serverPins === null) {
        try {
          const stored = localStorage.getItem(`showcase-pins-${userId}`)
          if (stored) {
            const parsed = JSON.parse(stored)
            if (Array.isArray(parsed) && parsed.length > 0) {
              setLocalPins(parsed.slice(0, MAX_PINNED))
              api('set-showcase-pins', { pins: parsed.slice(0, MAX_PINNED) })
              localStorage.removeItem(`showcase-pins-${userId}`)
            }
          }
        } catch {
          // Ignore localStorage errors
        }
      }
    }
  }, [serverPins, isOwnProfile, userId])

  const [showPicker, setShowPicker] = useState(false)
  const [pickerMessage, setPickerMessage] = useState<string | null>(null)
  // Badges injected via CustomEvent (for just-claimed trophies not yet in our data)
  const [injectedBadges, setInjectedBadges] = useState<ShowcaseBadgeData[]>([])

  // Keep a ref to localPins so the event handler always reads current state
  const localPinsRef = useRef(localPins)
  localPinsRef.current = localPins

  // Listen for 'open-showcase-picker' events from TrophiesTab
  useEffect(() => {
    if (!isOwnProfile) return
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { pinId?: string; badge?: ShowcaseBadgeData }
        | undefined
      const pinId = detail?.pinId

      // Inject badge data if provided (so we can render it without stale cache)
      if (detail?.badge) {
        setInjectedBadges((prev) => {
          if (prev.some((b) => b.id === detail.badge!.id)) return prev
          return [...prev, detail.badge!]
        })
      }

      // Also refresh our own data for eventual consistency
      refresh()

      if (!pinId) {
        setShowPicker(true)
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }

      // Try to auto-pin (compute new pins, then apply side effects)
      const current = (localPinsRef.current ?? []).filter((x) => x !== pinId)
      if (current.length >= MAX_PINNED) {
        setPickerMessage('Unpin a different trophy first')
        setShowPicker(true)
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }
      const next = [...current, pinId]
      setLocalPins(next)
      api('set-showcase-pins', { pins: next })
      setPickerMessage(null)
      setShowPicker(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
    window.addEventListener('open-showcase-picker', handler)
    return () => window.removeEventListener('open-showcase-picker', handler)
  }, [isOwnProfile, refresh])


  const togglePin = useCallback(
    (id: string, validIds: Set<string>) => {
      const current = (localPinsRef.current ?? []).filter((x) => validIds.has(x))
      let next: string[]
      if (current.includes(id)) {
        next = current.filter((x) => x !== id)
      } else if (current.length >= MAX_PINNED) {
        return
      } else {
        next = [...current, id]
      }
      setLocalPins(next)
      api('set-showcase-pins', { pins: next })
    },
    []
  )

  // Build badges from whatever data sources are available
  const allBadges: ShowcaseBadgeData[] = []
  const seenIds = new Set<string>()

  // 1. From claimed trophy milestones only
  if (achievements) {
    for (const b of generateBadgesFromTrophies(achievements, achievements.claimedTrophies ?? [])) {
      if (!seenIds.has(b.id)) {
        seenIds.add(b.id)
        allBadges.push(b)
      }
    }
  }

  // 2. From injected badges (just-claimed trophies not yet in our data)
  for (const b of injectedBadges) {
    if (!seenIds.has(b.id)) {
      seenIds.add(b.id)
      allBadges.push(b)
    }
  }

  // 3. From league info
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

  if (allBadges.length === 0 && !isOwnProfile) return null

  const badgeMap = new Map(allBadges.map((b) => [b.id, b]))
  const validIdSet = new Set(badgeMap.keys())

  // Use local optimistic pins, fall back to server, fall back to auto-show top 2
  // null = server has no row (never configured) → auto-show top 2
  // [] = user explicitly cleared all pins → show nothing
  // undefined = not loaded yet → auto-show top 2
  const pins = localPins !== undefined ? localPins : serverPins
  const effectivePins =
    pins === null || pins === undefined
      ? allBadges.slice(0, 2).map((b) => b.id)
      : pins.filter((id) => badgeMap.has(id))

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
              onClick={() => { setShowPicker(false); setPickerMessage(null) }}
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
          {pickerMessage ? (
            <span className="text-sm font-medium text-amber-600">
              {pickerMessage}
            </span>
          ) : (
            <span className="text-ink-500 text-xs">
              Select up to {MAX_PINNED}. Click a pinned badge to remove it.
            </span>
          )}
        </Col>
      )}
    </>
  )
}
