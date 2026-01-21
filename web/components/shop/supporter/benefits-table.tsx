import clsx from 'clsx'
import {
  SUPPORTER_TIERS,
  TIER_ORDER,
  BENEFIT_DEFINITIONS,
  SupporterTier,
} from 'common/supporter-config'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { TierBadge } from './tier-badge'

/**
 * Benefits comparison table for supporter tiers.
 *
 * IMPORTANT: The "OWNED" badge placement was painstakingly tuned for mobile/desktop.
 * DO NOT modify the badge positioning without thorough testing on both.
 * The current implementation uses:
 * - 1px borders on mobile, 2px on desktop (sm: prefix)
 * - Careful alignment with align-bottom and rounded corners
 * - Specific padding adjustments per breakpoint
 */
export function BenefitsTable({
  currentTier,
  activeTier,
}: {
  currentTier: SupporterTier | null
  activeTier: SupporterTier | null
}) {
  return (
    <div className="bg-canvas-0 border-ink-200 rounded-xl border">
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            {/* Header row with title and OWNED badge */}
            <tr>
              <th className="p-4 text-left">
                <h2 className="text-lg font-semibold">Benefits Comparison</h2>
              </th>
              {TIER_ORDER.map((tier) => {
                const isCurrentTier = currentTier === tier
                return (
                  <th
                    key={tier}
                    className="px-2 pb-0 pt-2 align-bottom sm:px-4"
                  >
                    {isCurrentTier && (
                      <div
                        className={clsx(
                          'mx-auto w-fit rounded-t-md px-1.5 py-0.5 text-[8px] font-bold',
                          'sm:px-2 sm:text-[10px]',
                          // Border width: 1px mobile, 2px desktop
                          'border-l border-r border-t',
                          'sm:border-l-2 sm:border-r-2 sm:border-t-2',
                          tier === 'basic' &&
                            'border-gray-400 bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200',
                          tier === 'plus' &&
                            'border-indigo-400 bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200',
                          tier === 'premium' &&
                            'border-amber-400 bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200'
                        )}
                      >
                        CURRENT
                      </div>
                    )}
                  </th>
                )
              })}
            </tr>
            {/* Column headers row */}
            <tr>
              <th className="text-ink-600 border-ink-200 border-b p-2 text-left text-sm font-medium sm:p-3">
                Benefit
              </th>
              {TIER_ORDER.map((tier) => {
                const isCurrentTier = currentTier === tier
                const isActiveTier = activeTier === tier
                return (
                  <th
                    key={tier}
                    className={clsx(
                      'p-2 text-center text-sm font-medium transition-all duration-200 sm:p-3',
                      isActiveTier &&
                        tier === 'basic' &&
                        'bg-gray-100 dark:bg-gray-700/40',
                      isActiveTier &&
                        tier === 'plus' &&
                        'bg-indigo-100 dark:bg-indigo-800/30',
                      isActiveTier &&
                        tier === 'premium' &&
                        'bg-amber-100/80 dark:bg-amber-800/25',
                      isCurrentTier &&
                        `border-l border-r border-t sm:border-l-2 sm:border-r-2 sm:border-t-2 ${SUPPORTER_TIERS[tier].borderColor} rounded-t-lg`,
                      !isCurrentTier && 'border-ink-200 border-b'
                    )}
                  >
                    <Row className="items-center justify-center gap-1">
                      <TierBadge tier={tier} animate={tier === 'premium'} />
                      <span
                        className={clsx(
                          'hidden sm:inline',
                          SUPPORTER_TIERS[tier].textColor
                        )}
                      >
                        {SUPPORTER_TIERS[tier].name}
                      </span>
                    </Row>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {BENEFIT_DEFINITIONS.map((benefit, idx) => {
              const isLastRow = idx === BENEFIT_DEFINITIONS.length - 1
              return (
                <tr key={benefit.id}>
                  <td
                    className={clsx(
                      'border-ink-200 py-2 pl-2 pr-1 sm:p-3',
                      !isLastRow && 'border-b',
                      idx % 2 === 0 ? 'bg-canvas-50' : ''
                    )}
                  >
                    <Row className="items-center gap-1 sm:gap-2">
                      <span className="text-base sm:text-lg">
                        {benefit.icon}
                      </span>
                      <Col>
                        <span className="text-xs font-medium sm:text-sm">
                          {benefit.title}
                        </span>
                        <span className="text-ink-500 hidden text-xs sm:block">
                          {benefit.description}
                        </span>
                      </Col>
                    </Row>
                  </td>
                  {TIER_ORDER.map((tier) => {
                    const isCurrentTier = currentTier === tier
                    const isActiveTier = activeTier === tier
                    const value = benefit.getValueForTier(tier)
                    return (
                      <td
                        key={tier}
                        className={clsx(
                          'p-2 text-center text-sm font-semibold transition-all duration-200 sm:p-3',
                          // Active tier highlight
                          isActiveTier &&
                            tier === 'basic' &&
                            'bg-gray-100 dark:bg-gray-700/40',
                          isActiveTier &&
                            tier === 'plus' &&
                            'bg-indigo-100 dark:bg-indigo-800/30',
                          isActiveTier &&
                            tier === 'premium' &&
                            'bg-amber-100/80 dark:bg-amber-800/25',
                          // Current tier border
                          isCurrentTier &&
                            `border-l border-r sm:border-l-2 sm:border-r-2 ${SUPPORTER_TIERS[tier].borderColor}`,
                          isCurrentTier &&
                            isLastRow &&
                            'rounded-b-lg border-b sm:border-b-2',
                          // Text colors - keep tier colors even when active for better visibility
                          benefit.isUniform
                            ? 'text-green-600'
                            : SUPPORTER_TIERS[tier].textColor
                        )}
                      >
                        {benefit.id === 'badge' ? (
                          <Row className="justify-center">
                            <TierBadge
                              tier={tier}
                              animate={tier === 'premium'}
                            />
                          </Row>
                        ) : (
                          value
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
