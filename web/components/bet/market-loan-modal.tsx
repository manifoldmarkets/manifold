import { useEffect } from 'react'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { User } from 'common/user'
import { LOAN_DAILY_INTEREST_RATE } from 'common/loans'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { formatMoney } from 'common/util/format'
import { api } from 'web/lib/api/api'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'

export function MarketLoanModal(props: {
  user: User
  isOpen: boolean
  setOpen: (open: boolean) => void
  contractId: string
  answerId?: string
}) {
  const { isOpen, user, setOpen, contractId, answerId } = props
  const { data: loanData } = useAPIGetter('get-market-loan-max', {
    contractId,
    answerId,
  })

  useEffect(() => {
    if (isOpen && !user.hasSeenLoanModal)
      api('me/update', { hasSeenLoanModal: true })
  }, [isOpen, user.hasSeenLoanModal])

  const currentFreeLoan = loanData?.currentFreeLoan ?? 0
  const currentMarginLoan = loanData?.currentMarginLoan ?? 0
  const totalOutstandingLoan = currentFreeLoan + currentMarginLoan

  return (
    <Modal open={isOpen} setOpen={setOpen} size="md">
      <Col className="bg-canvas-0 text-ink-1000 max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <Col className="border-ink-200 gap-3 border-b px-6 pb-4 pt-6">
          <Row className="items-center gap-3">
            <div className="text-4xl">🏦</div>
            <Col className="gap-0.5">
              <h2 className="text-ink-900 text-xl font-semibold">
                Loans on this market
              </h2>
              <p className="text-ink-600 text-sm">
                Overview of your outstanding loans
              </p>
            </Col>
          </Row>
        </Col>

        {!loanData ? (
          <Col className="items-center justify-center p-8">
            <LoadingIndicator />
          </Col>
        ) : (
          <>
            {/* Loan Breakdown Section */}
            <Col className="border-ink-200 gap-4 border-b px-6 py-5">
              <h3 className="text-ink-900 text-sm font-semibold">
                Loan Breakdown
              </h3>

              {/* Daily Loan Card */}
              <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
                <Row className="items-start justify-between">
                  <Col className="gap-1">
                    <Row className="items-center gap-2">
                      <span className="text-lg">🎁</span>
                      <span className="font-semibold text-green-800 dark:text-green-200">
                        Daily Loan
                      </span>
                    </Row>
                    <p className="text-sm text-green-700 dark:text-green-300">
                      No interest
                    </p>
                  </Col>
                  <Col className="items-end">
                    <span className="text-2xl font-bold text-green-700 dark:text-green-300">
                      {formatMoney(currentFreeLoan)}
                    </span>
                    <span className="text-xs text-green-600 dark:text-green-400">
                      Outstanding
                    </span>
                  </Col>
                </Row>
              </div>

              {/* Margin Loans Card */}
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
                <Row className="items-start justify-between">
                  <Col className="gap-1">
                    <Row className="items-center gap-2">
                      <span className="text-lg">📈</span>
                      <span className="font-semibold text-amber-800 dark:text-amber-200">
                        Margin Loans
                      </span>
                    </Row>
                    <p className="text-sm text-amber-700 dark:text-amber-300">
                      {LOAN_DAILY_INTEREST_RATE * 100}% daily interest
                    </p>
                  </Col>
                  <Col className="items-end">
                    <span className="text-2xl font-bold text-amber-700 dark:text-amber-300">
                      {formatMoney(currentMarginLoan)}
                    </span>
                    <span className="text-xs text-amber-600 dark:text-amber-400">
                      Outstanding
                    </span>
                  </Col>
                </Row>
              </div>

              {/* Total */}
              <div className="bg-canvas-50 rounded-lg border p-4">
                <Row className="items-center justify-between">
                  <span className="text-ink-700 font-medium">
                    Total Outstanding Loan
                  </span>
                  <span className="text-ink-900 text-2xl font-bold">
                    {formatMoney(totalOutstandingLoan)}
                  </span>
                </Row>
              </div>
            </Col>

            {/* Automatic Repayment Notice */}
            <div className="px-6 py-5">
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
                <Row className="items-start gap-3">
                  <span className="text-xl">✨</span>
                  <Col className="gap-2">
                    <p className="font-semibold text-blue-800 dark:text-blue-200">
                      Loans are repaid automatically
                    </p>
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      When you sell positions or markets resolve, your loans are
                      automatically repaid. Margin loans are repaid first to
                      stop interest from accruing.
                    </p>
                  </Col>
                </Row>
              </div>
            </div>
          </>
        )}
      </Col>
    </Modal>
  )
}
