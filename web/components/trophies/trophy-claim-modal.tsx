import clsx from 'clsx'
import { useEffect, useState } from 'react'

import {
  TrophyMilestone,
  getMilestone,
  getTrophyDefinition,
} from 'common/trophies'
import { Button } from 'web/components/buttons/button'
import { Modal } from 'web/components/layout/modal'
import { Avatar } from 'web/components/widgets/avatar'
import { FullscreenConfetti } from 'web/components/widgets/fullscreen-confetti'
import { useUser } from 'web/hooks/use-user'
import { ShowcaseBadge, getTrophyShowcaseBadge } from './profile-showcase'
import { TrophyBadgeImage } from './trophy-badge-image'
import { formatTrophyReward } from './trophy-reward-chip'
import { TROPHY_TIER_STYLES } from './trophy-styles'

export function TrophyClaimModal(props: {
  dialog: TrophyDialog
  showManaRewards: boolean
  onClose: () => void
  onExplain: (trophyId: string) => void
  onPin: (trophyId: string) => void
}) {
  const { dialog, showManaRewards, onClose, onExplain, onPin } = props
  const firstClaim = dialog.step === 'celebration' && dialog.first
  const onContinue = firstClaim ? () => onExplain(dialog.trophyId) : onClose
  return (
    <Modal
      open
      setOpen={onContinue}
      hideCloseButton={firstClaim}
      size={dialog.step === 'explainer' ? 'md' : 'sm'}
      closeButtonPosition="inside"
      ariaLabel={
        dialog.step === 'explainer' ? 'How trophies work' : 'Trophy unlocked'
      }
      className="bg-canvas-0 text-ink-900 rounded-t-2xl px-5 py-6 sm:rounded-2xl"
    >
      {dialog.step === 'celebration' ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <CelebrationBadge
            trophyId={dialog.trophyId}
            milestone={dialog.milestone}
          />
          <div>
            <p className="text-ink-500 text-sm font-medium">Trophy unlocked</p>
            <h2 className="text-2xl font-bold">{dialog.milestone.name}</h2>
            {dialog.more > 0 && (
              <p className="text-ink-600 text-sm">and {dialog.more} more</p>
            )}
          </div>
          {dialog.rewardAmount > 0 && (
            <span className="rounded-full bg-teal-100 px-3 py-1 text-sm font-semibold text-teal-700">
              +{formatTrophyReward(dialog.rewardAmount)} added to your balance
            </span>
          )}
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {!dialog.first && (
              <Button
                size="sm"
                color="gray-outline"
                onClick={() => onPin(dialog.trophyId)}
              >
                Pin to profile
              </Button>
            )}
            <Button size="sm" onClick={onContinue}>
              Continue
            </Button>
          </div>
        </div>
      ) : (
        <TrophyExplainer showManaRewards={showManaRewards} onClose={onClose} />
      )}
    </Modal>
  )
}

function TrophyExplainer(props: {
  showManaRewards: boolean
  onClose: () => void
}) {
  const { showManaRewards, onClose } = props
  return (
    <div className="flex flex-col gap-3 [text-wrap:pretty]">
      <ExplainerBadges />
      <h2 className="text-xl font-bold">How trophies work</h2>
      <p>
        Trophies mark what you do on Manifold: trades, markets you create,
        comments, streaks and more.
      </p>
      {showManaRewards && <p>Some trophies pay mana when you claim them.</p>}
      <p>
        Claim each one here, then pin your favourites to your profile, like
        this:
      </p>
      <ExampleProfile />
      <Button size="sm" className="mt-2 self-end" onClick={onClose}>
        Got it
      </Button>
    </div>
  )
}

const EXAMPLE_PINS = [
  ['net-worth', 'whale'],
  ['creator-traders', 'famous'],
  ['leagues', 'goat'],
].flatMap(([trophyId, milestoneId]) => {
  const def = getTrophyDefinition(trophyId)
  const milestone = def && getMilestone(def, milestoneId)
  return def && milestone
    ? [getTrophyShowcaseBadge(def, milestone, milestone.threshold)]
    : []
})

function ExampleProfile() {
  const user = useUser()
  return (
    <div
      aria-hidden
      className="border-primary-300/50 from-primary-100/60 to-canvas-50 pointer-events-none relative overflow-hidden rounded-xl border bg-gradient-to-br p-3 sm:p-4"
    >
      <div className="flex items-center gap-2.5">
        <Avatar
          noLink
          size="md"
          avatarUrl={user?.avatarUrl}
          username={user?.username}
        />
        <div className="min-w-0">
          <div className="truncate font-bold">{user?.name ?? 'You'}</div>
          {user && (
            <div className="text-ink-600 truncate text-xs">
              @{user.username}
            </div>
          )}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1.5">
        {EXAMPLE_PINS.map((badge, index) => (
          <div
            key={badge.id}
            className="motion-safe:animate-trophy-pop shrink-0"
            style={{
              animationDelay: `${400 + index * 120}ms`,
              animationFillMode: 'backwards',
            }}
          >
            <ShowcaseBadge badge={badge} hideStatBelowSm />
          </div>
        ))}
      </div>
      <p className="text-ink-600 mt-2 text-xs">
        More pin slots unlock as you claim more trophies.
      </p>
      <span className="via-primary-400/20 motion-safe:animate-trophy-shine absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent to-transparent" />
    </div>
  )
}

const EXPLAINER_BADGES = [
  ['liked-comments', 'well-said'],
  ['prediction-streak', 'phoenix'],
  ['markets-created', 'builder'],
] as const

function ExplainerBadges() {
  return (
    <div aria-hidden className="flex items-center justify-center gap-3">
      {EXPLAINER_BADGES.map(([trophyId, milestoneId], index) => {
        const definition = getTrophyDefinition(trophyId)
        const milestone = definition && getMilestone(definition, milestoneId)
        if (!milestone) return null
        const style = TROPHY_TIER_STYLES[milestone.tier]
        const popDelay = index * 120
        return (
          <div
            key={trophyId}
            className={clsx(
              'motion-safe:animate-trophy-explainer rounded-full bg-gradient-to-br',
              index === 1 ? 'h-14 w-14' : 'h-12 w-12',
              style.gradient,
              style.ringWidth,
              style.glow
            )}
            style={{ animationDelay: `${popDelay}ms, ${popDelay + 240}ms` }}
          >
            <div className="bg-canvas-50 grid h-full place-items-center rounded-full">
              <TrophyBadgeImage
                trophyId={trophyId}
                milestone={milestone}
                className="h-full w-full p-1"
                emojiClassName="text-2xl"
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export type TrophyDialog =
  | {
      step: 'celebration'
      trophyId: string
      milestone: TrophyMilestone
      more: number
      rewardAmount: number
      first: boolean
    }
  | { step: 'explainer'; trophyId?: string }

function CelebrationBadge(props: {
  trophyId: string
  milestone: TrophyMilestone
}) {
  const { trophyId, milestone } = props
  const [confetti, setConfetti] = useState(false)
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    setConfetti(!motion.matches)
    const stop = () => {
      if (motion.matches) setConfetti(false)
    }
    motion.addEventListener('change', stop)
    return () => motion.removeEventListener('change', stop)
  }, [])
  const style = TROPHY_TIER_STYLES[milestone.tier]
  return (
    <>
      {confetti && (
        <FullscreenConfetti onConfettiComplete={() => setConfetti(false)} />
      )}
      <div
        className={clsx(
          'motion-safe:animate-trophy-pop rounded-full bg-gradient-to-br',
          style.gradient,
          style.ringWidth,
          style.glow
        )}
      >
        <div className="bg-canvas-50 flex h-28 w-28 items-center justify-center rounded-full">
          <TrophyBadgeImage
            trophyId={trophyId}
            milestone={milestone}
            className="h-24 w-24"
            emojiClassName="text-6xl"
          />
        </div>
      </div>
    </>
  )
}
