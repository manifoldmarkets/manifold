import clsx from 'clsx'
import { lowerFirst } from 'lodash'
import { useEffect, useState } from 'react'

import {
  TrophyMilestone,
  getNextOnboardingMilestone,
  getTrophyClaimReward,
} from 'common/trophies'
import { Button } from 'web/components/buttons/button'
import { Modal } from 'web/components/layout/modal'
import { FullscreenConfetti } from 'web/components/widgets/fullscreen-confetti'
import type { UserTrophies } from 'web/hooks/use-user-trophies'
import { TrophyBadgeImage } from './trophy-badge-image'
import { FindMarketLink, getOnboardingHint } from './trophy-onboarding-section'
import { formatTrophyReward } from './trophy-reward-chip'
import { TROPHY_TIER_STYLES } from './trophy-styles'

export function TrophyClaimModal(props: {
  dialog: TrophyDialog
  trophies: UserTrophies
  multiplier: number
  onClose: () => void
  onExplain: () => void
  onPin: (trophyId: string) => void
}) {
  const { dialog, trophies, multiplier, onClose, onExplain, onPin } = props
  return (
    <Modal
      open
      setOpen={onClose}
      size="sm"
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
            <Button
              size="sm"
              color="gray-outline"
              onClick={() => onPin(dialog.trophyId)}
            >
              Pin to profile
            </Button>
            <Button size="sm" onClick={dialog.first ? onExplain : onClose}>
              Continue
            </Button>
          </div>
        </div>
      ) : (
        <TrophyExplainer
          trophies={trophies}
          multiplier={multiplier}
          onClose={onClose}
        />
      )}
    </Modal>
  )
}

function TrophyExplainer(props: {
  trophies: UserTrophies
  multiplier: number
  onClose: () => void
}) {
  const { trophies, multiplier, onClose } = props
  const next = getNextOnboardingMilestone(trophies.starter, trophies.claims)
  const nextReward = next
    ? getTrophyClaimReward(
        next.definition,
        next.milestone,
        trophies.rewarded,
        multiplier
      )
    : 0
  return (
    <div className="flex flex-col gap-3">
      <h2 className="pr-7 text-xl font-bold">How trophies work</h2>
      <p>
        Trophies mark what you do on Manifold: trades, markets you create,
        comments, streaks and more.
      </p>
      {trophies.starter && (
        <p>
          {multiplier > 0
            ? 'Getting started trophies pay mana when you claim them.'
            : 'Getting started trophies mark your first trades.'}
          {next && (
            <>
              {' '}
              Next up: {next.milestone.name}.{' '}
              {nextReward > 0
                ? `To earn ${formatTrophyReward(nextReward)}, ${lowerFirst(
                    getOnboardingHint(next)
                  )}.`
                : `${getOnboardingHint(next)}.`}
            </>
          )}
        </p>
      )}
      <p>Claim each one here, then pin your favourites to your profile.</p>
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        {next && <FindMarketLink source="explainer" />}
        <Button
          size="sm"
          color={next ? 'gray-outline' : 'indigo'}
          onClick={onClose}
        >
          Got it
        </Button>
      </div>
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
  | { step: 'explainer' }

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
