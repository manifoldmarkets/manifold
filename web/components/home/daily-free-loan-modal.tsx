import { User } from 'common/user'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { formatMoney } from 'common/util/format'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { GiChest, GiOpenChest } from 'react-icons/gi'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { useIsEligibleForLoans } from 'web/hooks/use-is-eligible-for-loans'
import { PayBackLoanForm } from 'web/components/bet/pay-back-loan-form'
import { FREE_LOAN_POSITION_PERCENT } from 'common/loans'
import { Tooltip } from 'web/components/widgets/tooltip'

export function DailyFreeLoanModal(props: {
  isOpen: boolean
  setOpen: (open: boolean) => void
  user: User
  refreshPortfolio?: () => void
}) {
  const { isOpen, setOpen, user, refreshPortfolio } = props

  const { latestPortfolio } = useIsEligibleForLoans(user.id)
  const { data: freeLoanData, refresh } = useAPIGetter(
    'get-free-loan-available',
    {}
  )
  const { data: loanData, refresh: refreshLoanData } = useAPIGetter(
    'get-next-loan-amount',
    { userId: user.id }
  )

  if (!freeLoanData || !loanData) {
    return (
      <Modal open={isOpen} setOpen={setOpen}>
        <Col className="bg-canvas-0 rounded-md p-6">
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

  // Determine the reason for ineligibility
  const alreadyClaimedToday = (freeLoanData.todaysFreeLoan ?? 0) > 0
  const atMaxLoanLimit =
    freeLoanData.totalLoan >= freeLoanData.maxLoan && freeLoanData.maxLoan > 0
  const noEligiblePositions =
    !alreadyClaimedToday && !atMaxLoanLimit && freeLoanAvailable < 1

  // Check if user has lots of money to determine slider size
  const hasLotsOfMoney =
    !!latestPortfolio &&
    latestPortfolio.balance + latestPortfolio.investmentValue > 10000

  const handleSuccess = () => {
    refresh()
    refreshLoanData()
    refreshPortfolio?.()
  }

  return (
    <Modal open={isOpen} setOpen={setOpen} size="mdlg">
      <Col className="bg-canvas-0 text-ink-1000 max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <Col className="border-ink-200 gap-3 border-b px-6 pb-4 pt-6">
          <Row className="items-center gap-3">
            {canClaim ? (
              <GiChest className="h-10 w-10 text-yellow-500" />
            ) : (
              <GiOpenChest className="h-10 w-10 text-amber-700" />
            )}
            <Col className="gap-0.5">
              <h2 className="text-ink-900 text-xl font-semibold">
                Daily Free Loan
              </h2>
              <p className="text-ink-600 text-sm">
                Interest-free loans you can claim every day
              </p>
            </Col>
          </Row>
        </Col>

        {/* Key Metrics */}
        <Row className="border-ink-100 gap-3 border-b px-6 py-4">
          <Col className="flex-1 gap-1">
            <span className="text-ink-500 text-xs font-medium uppercase tracking-wide">
              Today's Loan
            </span>
            <span className="text-2xl font-semibold text-green-600">
              {formatMoney(freeLoanData.todaysFreeLoan ?? 0)}
            </span>
            <span className="text-ink-500 text-xs">Claimed today</span>
          </Col>
          <Col className="border-ink-200 flex-1 gap-1 border-l pl-3">
            <span className="text-ink-500 text-xs font-medium uppercase tracking-wide">
              Total Outstanding
            </span>
            <span className="text-ink-900 text-2xl font-semibold">
              {formatMoney(totalLoan)}
            </span>
            <span className="text-ink-500 text-xs">
              Free: {formatMoney(currentFreeLoan)} • Margin:{' '}
              {formatMoney(currentMarginLoan)}
            </span>
          </Col>
        </Row>

        {/* Status Banner */}
        {canClaim && freeLoanAvailable >= 1 ? (
          <div className="border-ink-200 border-b px-6 py-4">
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
              <p className="font-medium text-green-800 dark:text-green-200">
                You have {formatMoney(freeLoanAvailable)} available to claim
                today!
              </p>
              <p className="mt-1 text-sm text-green-600 dark:text-green-400">
                Click the golden chest on the daily stats bar to claim your free
                loan.
              </p>
            </div>
          </div>
        ) : alreadyClaimedToday ? (
          <div className="border-ink-200 border-b px-6 py-4">
            <div className="bg-canvas-50 rounded-lg p-4">
              <p className="text-ink-600 font-medium">
                You've already claimed your daily free loan today
              </p>
              <p className="text-ink-500 mt-1 text-sm">
                Come back after midnight PT for your next free loan!
              </p>
            </div>
          </div>
        ) : atMaxLoanLimit ? (
          <div className="border-ink-200 border-b px-6 py-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
              <p className="font-medium text-amber-800 dark:text-amber-200">
                You're at your maximum loan limit
              </p>
              <p className="mt-1 text-sm text-amber-600 dark:text-amber-400">
                Repay some of your existing loan to claim more free loans.
              </p>
            </div>
          </div>
        ) : noEligiblePositions ? (
          <div className="border-ink-200 border-b px-6 py-4">
            <div className="bg-canvas-50 rounded-lg p-4">
              <p className="text-ink-600 font-medium">
                No eligible positions for free loans
              </p>
              <p className="text-ink-500 mt-1 text-sm">
                Invest in eligible markets (listed, ranked, 10+ traders, 24+
                hours old) to earn free loans.
              </p>
            </div>
          </div>
        ) : (
          <div className="border-ink-200 border-b px-6 py-4">
            <div className="bg-canvas-50 rounded-lg p-4">
              <p className="text-ink-600 font-medium">No free loan available</p>
              <p className="text-ink-500 mt-1 text-sm">
                Come back after midnight PT for your next free loan!
              </p>
            </div>
          </div>
        )}

        {/* Information Section */}
        <Col className="gap-2 px-6 py-4">
          <h3 className="text-ink-900 text-sm font-semibold">How it works</h3>
          <p className="text-ink-600 text-sm">
            Claim a daily interest-free loan of{' '}
            {FREE_LOAN_POSITION_PERCENT * 100}% the value of your active market
            positions. The loan is distributed proportionally across all{' '}
            <Tooltip text="Listed, ranked markets with 10+ traders that are 24+ hours old">
              <span className="cursor-help underline decoration-dotted">
                eligible
              </span>
            </Tooltip>{' '}
            unresolved market positions.
          </p>
        </Col>

        {/* Repayment Section */}
        <PayBackLoanForm
          user={user}
          totalLoan={totalLoan}
          hasLotsOfMoney={hasLotsOfMoney}
          onSuccess={handleSuccess}
          description="Repayments go toward margin loans first (to stop interest), then free loans."
        />
      </Col>
    </Modal>
  )
}
