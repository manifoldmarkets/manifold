import { useEffect, useState } from 'react'
import clsx from 'clsx'
import toast from 'react-hot-toast'

import { useEvent } from 'client-common/hooks/use-event'
import { DIVISION_NAMES } from 'common/leagues'
import {
  LEAGUE_SHOWCASE_PIN,
  TROPHY_DEFINITIONS,
  TROPHY_TIER_ORDER,
  TrophyClaim,
  TrophyStats,
  TrophyTier,
  countClaimedMilestones,
  formatTrophyValue,
  getHighestClaimedMilestone,
  getMaxShowcasePins,
  getTrophyPinId,
  getTrophyStatValue,
} from 'common/trophies'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import {
  OPEN_SHOWCASE_PICKER_EVENT,
  OpenShowcasePickerDetail,
} from 'web/components/trophies/open-showcase-picker'
import { Tooltip } from 'web/components/widgets/tooltip'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useLeagueInfo } from 'web/hooks/use-leagues'
import { useUserTrophies } from 'web/hooks/use-user-trophies'
import { api } from 'web/lib/api/api'

// Pinned trophies under a user's name on their profile.
export function ProfileShowcase(props: {
  userId: string
  isOwnProfile: boolean
}) {
  const { userId, isOwnProfile } = props

  const { data: achievements } = useAPIGetter('get-user-achievements', {
    userId,
  })
  const { trophies, update } = useUserTrophies(userId)
  const league = useLeagueInfo(userId)

  const [showPicker, setShowPicker] = useState(false)
  const [pickerMessage, setPickerMessage] = useState<string | null>(null)

  const claims = trophies?.claims ?? []
  const maxPins = getMaxShowcasePins(countClaimedMilestones(claims))

  const badges = sortBadges([
    ...getTrophyBadges(achievements ?? {}, claims),
    ...(league ? getLeagueBadges(league) : []),
  ])
  const badgeById = new Map(badges.map((b) => [b.id, b]))

  // null: never set, so show the best badges. []: the user removed them all.
  const savedPins = trophies?.pins
  const defaultPins = badges.slice(0, maxPins).map((b) => b.id)
  const pins =
    savedPins == null
      ? defaultPins
      : savedPins.filter((id) => badgeById.has(id)).slice(0, maxPins)

  const savePins = async (next: string[]) => {
    if (!trophies) return
    const previous = trophies
    update({ ...trophies, pins: next })
    try {
      await api('set-showcase-pins', { pins: next })
    } catch (e) {
      update(previous)
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  const togglePin = (id: string) => {
    if (pins.includes(id)) {
      savePins(pins.filter((p) => p !== id))
    } else if (pins.length < maxPins) {
      savePins([...pins, id])
    } else {
      setPickerMessage('Unpin a trophy first')
    }
  }

  // "Pin to profile" on a just-claimed trophy card.
  const onOpenPicker = useEvent((e: Event) => {
    const { pinId } = ((e as CustomEvent).detail ??
      {}) as OpenShowcasePickerDetail
    setShowPicker(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
    if (!pinId || pins.includes(pinId)) {
      setPickerMessage(null)
      return
    }
    // Pins the user never chose make way for one they did.
    const base = savedPins == null ? pins.slice(0, maxPins - 1) : pins
    if (base.length >= maxPins) {
      setPickerMessage('Unpin a trophy first')
      return
    }
    setPickerMessage(null)
    savePins([...base, pinId])
  })
  useEffect(() => {
    if (!isOwnProfile) return
    window.addEventListener(OPEN_SHOWCASE_PICKER_EVENT, onOpenPicker)
    return () =>
      window.removeEventListener(OPEN_SHOWCASE_PICKER_EVENT, onOpenPicker)
  }, [isOwnProfile, onOpenPicker])

  if (!trophies || (badges.length === 0 && !isOwnProfile)) return null

  const pinnedBadges = pins.flatMap((id) => badgeById.get(id) ?? [])

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
        {isOwnProfile && pins.length < maxPins && (
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
              onClick={() => {
                setShowPicker(false)
                setPickerMessage(null)
              }}
            >
              Done
            </button>
          </Row>
          {badges.length === 0 ? (
            <span className="text-ink-500 text-sm">
              Claim a trophy on the Trophies tab to pin it here.
            </span>
          ) : (
            <div className="flex flex-wrap gap-2">
              {badges.map((b) => (
                <ShowcaseBadge
                  key={b.id}
                  badge={b}
                  size="lg"
                  onClick={() => togglePin(b.id)}
                  selected={pins.includes(b.id)}
                />
              ))}
            </div>
          )}
          {pickerMessage ? (
            <span className="text-sm font-medium text-amber-600">
              {pickerMessage}
            </span>
          ) : (
            <span className="text-ink-500 text-xs">
              Select up to {maxPins}. Click a pinned trophy to remove it.
            </span>
          )}
        </Col>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

type BadgeTier = TrophyTier | 'gray'

type ShowcaseBadgeData = {
  id: string // the pin id
  label: string
  stat?: string // shown after the label, e.g. "2.3M"
  detail: string // tooltip
  emoji: string
  tier: BadgeTier
}

const BADGE_TIER_ORDER: BadgeTier[] = [...TROPHY_TIER_ORDER, 'gray']

const BADGE_STYLES: Record<BadgeTier, { gradient: string; text: string }> = {
  gray: {
    gradient: 'from-zinc-400 to-zinc-500',
    text: 'text-zinc-600 dark:text-zinc-400',
  },
  green: {
    gradient: 'from-emerald-400 to-emerald-600',
    text: 'text-emerald-600 dark:text-emerald-400',
  },
  blue: {
    gradient: 'from-sky-400 to-blue-600',
    text: 'text-blue-600 dark:text-blue-400',
  },
  purple: {
    gradient: 'from-violet-400 to-purple-600',
    text: 'text-violet-600 dark:text-violet-400',
  },
  crimson: {
    gradient: 'from-red-500 to-rose-700',
    text: 'text-red-600 dark:text-red-400',
  },
  gold: {
    gradient: 'from-amber-400 to-yellow-600',
    text: 'text-amber-600 dark:text-amber-400',
  },
  prismatic: {
    gradient: 'from-pink-400 via-cyan-400 to-yellow-400',
    text: 'bg-gradient-to-r from-pink-500 via-cyan-500 to-yellow-500 bg-clip-text text-transparent',
  },
}

const sortBadges = (badges: ShowcaseBadgeData[]) =>
  badges
    .slice()
    .sort(
      (a, b) =>
        BADGE_TIER_ORDER.indexOf(a.tier) - BADGE_TIER_ORDER.indexOf(b.tier)
    )

// One badge per trophy: its highest claimed milestone.
function getTrophyBadges(
  stats: TrophyStats,
  claims: TrophyClaim[]
): ShowcaseBadgeData[] {
  return TROPHY_DEFINITIONS.flatMap((def) => {
    const milestone = getHighestClaimedMilestone(def, claims)
    if (!milestone) return []
    const value = formatTrophyValue(def, getTrophyStatValue(def, stats))
    return [
      {
        id: getTrophyPinId(def.id),
        label: milestone.name,
        stat: value,
        detail: `${def.label}: ${value}${
          def.formatPrefix ? '' : ` ${def.unit}`
        }`,
        emoji: milestone.emoji,
        tier: milestone.tier,
      },
    ]
  })
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

function leagueTier(division: number): BadgeTier {
  if (division >= 6) return 'prismatic'
  if (division >= 5) return 'gold'
  if (division >= 4) return 'purple'
  if (division >= 3) return 'blue'
  if (division >= 2) return 'green'
  return 'gray'
}

// The current league, from Silver up.
function getLeagueBadges(league: {
  division: number
  rank: number
  season: number
}): ShowcaseBadgeData[] {
  if (league.division < 2) return []
  const divName = DIVISION_NAMES[league.division] ?? 'Unknown'
  return [
    {
      id: LEAGUE_SHOWCASE_PIN,
      label: `${divName} S${league.season}`,
      detail: `${divName} division, rank #${league.rank}, season ${league.season}`,
      emoji: LEAGUE_EMOJI[league.division] ?? '\u{1F3C6}',
      tier: leagueTier(league.division),
    },
  ]
}

function ShowcaseBadge(props: {
  badge: ShowcaseBadgeData
  onClick?: () => void
  selected?: boolean
  size?: 'sm' | 'lg'
}) {
  const { badge, onClick, selected, size = 'sm' } = props
  const style = BADGE_STYLES[badge.tier]
  const isLarge = size === 'lg'

  const content = (
    <div className={clsx('rounded-[5px] bg-gradient-to-br', style.gradient)}>
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
        <span className={isLarge ? 'text-lg' : 'text-sm'} aria-hidden>
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
  )

  return (
    <Tooltip text={badge.detail}>
      {onClick ? (
        <button
          className={clsx(
            'relative cursor-pointer rounded-lg border p-[1.5px] transition-all hover:scale-105',
            selected
              ? 'ring-primary-500 ring-2 ring-offset-1'
              : 'border-transparent'
          )}
          onClick={onClick}
          aria-pressed={selected}
        >
          {content}
        </button>
      ) : (
        <div className="relative rounded-lg border border-transparent p-[1.5px]">
          {content}
        </div>
      )}
    </Tooltip>
  )
}
