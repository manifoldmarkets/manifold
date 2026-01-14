import { User } from 'common/user'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { formatMoney } from 'common/util/format'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { GiTwoCoins, GiOpenChest } from 'react-icons/gi'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { FREE_LOAN_POSITION_PERCENT } from 'common/loans'
import { Tooltip } from 'web/components/widgets/tooltip'
import clsx from 'clsx'

export function DailyFreeLoanModal(props: {
  isOpen: boolean
  setOpen: (open: boolean) => void
  user: User
}) {
  const { isOpen, setOpen, user } = props

  const { data: freeLoanData } = useAPIGetter('get-free-loan-available', {})
  const { data: loanData } = useAPIGetter('get-next-loan-amount', {
    userId: user.id,
  })

  if (!freeLoanData || !loanData) {
    return (
      <Modal open={isOpen} setOpen={setOpen}>
        <Col className="bg-canvas-0 items-center justify-center rounded-md p-8">
          <LoadingIndicator />
        </Col>
      </Modal>
    )
  }

  const canClaim = freeLoanData.canClaim
  const freeLoanAvailable = freeLoanData.available
  const currentFreeLoan = loanData.currentFreeLoan ?? 0
  const currentMarginLoan = loanData.currentMarginLoan ?? 0
  const totalLoan = currentFreeLoan + currentMarginLoan
  const todaysClaim = freeLoanData.todaysFreeLoan ?? 0

  // Determine the reason for ineligibility
  const alreadyClaimedToday = todaysClaim > 0
  const atMaxLoanLimit =
    freeLoanData.totalLoan >= freeLoanData.maxLoan && freeLoanData.maxLoan > 0
  const noEligiblePositions =
    !alreadyClaimedToday && !atMaxLoanLimit && freeLoanAvailable < 1

  return (
    <Modal open={isOpen} setOpen={setOpen} size="md">
      <Col className="bg-canvas-0 text-ink-1000 overflow-hidden rounded-xl">
        {/* Hero Section */}
        <div
          className={clsx(
            'relative px-6 py-8',
            canClaim && freeLoanAvailable >= 1
              ? 'bg-gradient-to-br from-amber-400 via-yellow-400 to-orange-400'
              : alreadyClaimedToday
              ? 'bg-gradient-to-br from-emerald-500 via-green-500 to-teal-500'
              : 'bg-gradient-to-br from-slate-400 via-slate-500 to-slate-600'
          )}
        >
          {/* Decorative coins */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-20">
            <div className="absolute -right-4 -top-4 text-8xl">💰</div>
            <div className="absolute -bottom-2 -left-2 text-6xl">🪙</div>
          </div>

          <Col className="relative z-10 items-center gap-4">
            {/* Icon */}
            <div
              className={clsx(
                'flex h-20 w-20 items-center justify-center rounded-full',
                canClaim && freeLoanAvailable >= 1
                  ? 'animate-pulse bg-white/30 shadow-lg shadow-amber-600/30'
                  : 'bg-white/20'
              )}
            >
              {alreadyClaimedToday ? (
                <GiOpenChest className="h-12 w-12 text-white drop-shadow-md" />
              ) : (
                <GiTwoCoins className="h-12 w-12 text-white drop-shadow-md" />
              )}
            </div>

            {/* Title */}
            <Col className="items-center gap-1 text-center">
              <h2 className="text-2xl font-bold text-white drop-shadow-sm">
                Daily Loan
              </h2>
              <p className="text-sm text-white/80">
                Free interest-free loans every day!
              </p>
            </Col>

            {/* Main Status */}
            {canClaim && freeLoanAvailable >= 1 ? (
              <div className="rounded-full bg-white/90 px-6 py-2 shadow-lg">
                <span className="text-lg font-bold text-amber-700">
                  {formatMoney(freeLoanAvailable)} ready to claim!
                </span>
              </div>
            ) : alreadyClaimedToday ? (
              <div className="rounded-full bg-white/90 px-6 py-2 shadow-lg">
                <span className="text-lg font-bold text-emerald-700">
                  ✓ Claimed {formatMoney(todaysClaim)} today
                </span>
              </div>
            ) : atMaxLoanLimit ? (
              <div className="rounded-full bg-white/90 px-6 py-2 shadow-lg">
                <span className="font-semibold text-slate-700">
                  🔒 Max loan limit reached
                </span>
              </div>
            ) : noEligiblePositions ? (
              <div className="rounded-full bg-white/90 px-6 py-2 shadow-lg">
                <span className="font-semibold text-slate-700">
                  📊 Need eligible positions
                </span>
              </div>
            ) : (
              <div className="rounded-full bg-white/90 px-6 py-2 shadow-lg">
                <span className="font-semibold text-slate-700">
                  ⏰ Come back tomorrow!
                </span>
              </div>
            )}
          </Col>
        </div>

        {/* Stats Section */}
        <div className="border-ink-100 border-b px-6 py-4">
          <Row className="gap-4">
            <Col className="flex-1 items-center gap-1 rounded-lg bg-gradient-to-br from-green-50 to-emerald-50 p-3 dark:from-green-900/20 dark:to-emerald-900/20">
              <span className="text-xs font-medium text-green-600 dark:text-green-400">
                TODAY
              </span>
              <span className="text-xl font-bold text-green-700 dark:text-green-300">
                {formatMoney(todaysClaim)}
              </span>
            </Col>
            <Col className="flex-1 items-center gap-1 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 p-3 dark:from-blue-900/20 dark:to-indigo-900/20">
              <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                TOTAL LOAN
              </span>
              <span className="text-xl font-bold text-blue-700 dark:text-blue-300">
                {formatMoney(totalLoan)}
              </span>
            </Col>
          </Row>
          {totalLoan > 0 && (
            <p className="text-ink-500 mt-2 text-center text-xs">
              Daily: {formatMoney(currentFreeLoan)} • Margin:{' '}
              {formatMoney(currentMarginLoan)}
            </p>
          )}
        </div>

        {/* Action Hint */}
        {canClaim && freeLoanAvailable >= 1 && (
          <div className="bg-amber-50 px-6 py-3 dark:bg-amber-900/20">
            <p className="text-center text-sm font-medium text-amber-800 dark:text-amber-200">
              💡 Click the{' '}
              <span className="inline-flex items-center gap-1">
                <GiTwoCoins className="inline h-4 w-4" /> coins
              </span>{' '}
              on the stats bar to claim!
            </p>
          </div>
        )}

        {/* Status-specific messages */}
        {atMaxLoanLimit && (
          <div className="bg-amber-50 px-6 py-3 dark:bg-amber-900/20">
            <p className="text-center text-sm text-amber-700 dark:text-amber-300">
              Repay some of your existing loan to unlock more daily bonuses.
            </p>
          </div>
        )}

        {noEligiblePositions && (
          <div className="bg-canvas-50 px-6 py-3">
            <p className="text-ink-600 text-center text-sm">
              Invest in{' '}
              <Tooltip text="Listed, ranked markets with 10+ traders that are 24+ hours old">
                <span className="cursor-help underline decoration-dotted">
                  eligible markets
                </span>
              </Tooltip>{' '}
              to start earning daily bonuses!
            </p>
          </div>
        )}

        {alreadyClaimedToday && (
          <div className="bg-emerald-50 px-6 py-3 dark:bg-emerald-900/20">
            <p className="text-center text-sm text-emerald-700 dark:text-emerald-300">
              🌙 Next bonus available after midnight PT
            </p>
          </div>
        )}

        {/* How it works */}
        <Col className="gap-3 px-6 py-4">
          <h3 className="text-ink-900 text-xs font-semibold uppercase tracking-wide">
            How it works
          </h3>
          <Row className="gap-3">
            <div className="bg-canvas-50 flex-1 rounded-lg p-3 text-center">
              <div className="mb-1 text-2xl">📈</div>
              <p className="text-ink-700 text-xs font-medium">
                {FREE_LOAN_POSITION_PERCENT * 100}% of positions
              </p>
              <p className="text-ink-500 text-xs">daily</p>
            </div>
            <div className="bg-canvas-50 flex-1 rounded-lg p-3 text-center">
              <div className="mb-1 text-2xl">🎁</div>
              <p className="text-ink-700 text-xs font-medium">0% interest</p>
              <p className="text-ink-500 text-xs">forever</p>
            </div>
            <div className="bg-canvas-50 flex-1 rounded-lg p-3 text-center">
              <div className="mb-1 text-2xl">✨</div>
              <p className="text-ink-700 text-xs font-medium">Auto-repaid</p>
              <p className="text-ink-500 text-xs">on resolve</p>
            </div>
          </Row>
        </Col>
      </Col>
    </Modal>
  )
}
