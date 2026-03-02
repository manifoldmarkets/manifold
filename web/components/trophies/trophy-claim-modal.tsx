import clsx from 'clsx'

import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Modal, MODAL_CLASS } from 'web/components/layout/modal'
import { Button } from 'web/components/buttons/button'
import { FullscreenConfetti } from 'web/components/widgets/fullscreen-confetti'
import {
  type TrophyDefinition,
  type TrophyTier,
  TROPHY_TIER_INDEX,
  TROPHY_TIER_STYLES,
  CATEGORY_EMOJI,
  getNextUnclaimedTier,
  formatTrophyValue,
} from 'common/trophies'

function getConfettiPieces(tier: TrophyTier): number {
  const idx = TROPHY_TIER_INDEX[tier]
  if (idx <= 1) return 0 // gray, green — no confetti
  if (idx <= 3) return 150 // blue, purple
  if (idx <= 5) return 300 // crimson, gold
  return 500 // prismatic
}

export function TrophyClaimModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
  definition: TrophyDefinition
  claimedTier: TrophyTier
  currentValue: number
}) {
  const { open, setOpen, definition, claimedTier, currentValue } = props
  const style = TROPHY_TIER_STYLES[claimedTier]
  const nextTier = getNextUnclaimedTier(definition.id, claimedTier)
  const confettiCount = getConfettiPieces(claimedTier)
  const emoji = CATEGORY_EMOJI[definition.category]
  const isPrismatic = claimedTier === 'prismatic'

  return (
    <>
      {open && confettiCount > 0 && (
        <FullscreenConfetti numberOfPieces={confettiCount} />
      )}
      <Modal open={open} setOpen={setOpen} size="sm">
        <Col
          className={clsx(
            MODAL_CLASS,
            'items-center text-center',
            isPrismatic &&
              'bg-gradient-to-br from-pink-50 via-cyan-50 to-yellow-50 dark:from-pink-950/30 dark:via-cyan-950/30 dark:to-yellow-950/30'
          )}
        >
          {/* Trophy icon with tier gradient */}
          <div
            className={clsx(
              'flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br',
              style.gradient
            )}
          >
            <span className="text-4xl">{emoji}</span>
          </div>

          {/* Title */}
          <div className="text-ink-900 text-xl font-bold">
            {definition.name}
          </div>

          {/* Tier label */}
          <div className={clsx('text-lg font-semibold', style.textColor)}>
            {style.label} Tier
          </div>

          <div className="text-ink-600 text-sm font-medium">Earned!</div>

          {/* Next tier preview with exact numbers */}
          {nextTier ? (
            <Col className="bg-canvas-50 mt-3 w-full gap-2 rounded-lg p-4">
              <Row className="items-center justify-between">
                <span className="text-ink-600 text-xs font-medium uppercase tracking-wider">
                  Next: {TROPHY_TIER_STYLES[nextTier.tier].label}
                </span>
                <span className="text-ink-500 text-xs">
                  {formatTrophyValue(definition, currentValue)} /{' '}
                  {formatTrophyValue(definition, nextTier.threshold)}
                </span>
              </Row>
              {/* Mini progress bar */}
              <div className="bg-ink-200 h-2 w-full overflow-hidden rounded-full">
                <div
                  className={clsx(
                    'h-full rounded-full bg-gradient-to-r',
                    TROPHY_TIER_STYLES[nextTier.tier].gradient
                  )}
                  style={{
                    width: `${Math.min((currentValue / nextTier.threshold) * 100, 100)}%`,
                  }}
                />
              </div>
              <div className="text-ink-700 text-sm">
                {formatTrophyValue(
                  definition,
                  nextTier.threshold - currentValue
                )}{' '}
                more to reach {TROPHY_TIER_STYLES[nextTier.tier].label}
              </div>
            </Col>
          ) : (
            <div className="mt-3 text-sm font-medium text-amber-500">
              Maximum tier reached!
            </div>
          )}

          <Button
            color="indigo-outline"
            size="sm"
            className="mt-3"
            onClick={() => setOpen(false)}
          >
            View Trophies
          </Button>
        </Col>
      </Modal>
    </>
  )
}
