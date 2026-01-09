import { useState, useEffect } from 'react'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { PLURAL_BETS, User } from 'common/user'
import { ENV_CONFIG, TRADE_TERM } from 'common/envs/constants'
import {
  LOAN_DAILY_RATE,
  LOAN_DAILY_INTEREST_RATE,
  overLeveraged,
} from 'common/loans'
import { ANNUAL_INTEREST_RATE } from 'common/economy'
import { useHasReceivedLoanToday } from 'web/hooks/use-has-received-loan'
import { useIsEligibleForLoans } from 'web/hooks/use-is-eligible-for-loans'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { formatMoney, formatPercent } from 'common/util/format'
import { MAX_LOAN_NET_WORTH_PERCENT } from 'common/loans'
import { api } from 'web/lib/api/api'
import { toast } from 'react-hot-toast'
import { track } from 'web/lib/service/analytics'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { Button } from 'web/components/buttons/button'

export function LoansModal(props: {
  user: User
  isOpen: boolean
  setOpen: (open: boolean) => void
  refreshPortfolio?: () => void
}) {
  const { isOpen, user, setOpen, refreshPortfolio } = props
  const [loaning, setLoaning] = useState(false)
  const [justReceivedLoan, setJustReceivedLoan] = usePersistentInMemoryState(
    false,
    `just-received-loan-${user.id}`
  )
  const { receivedLoanToday: receivedTxnLoan, checkTxns } =
    useHasReceivedLoanToday(user)
  const { latestPortfolio, isEligible } = useIsEligibleForLoans(user.id)
  const { data } = useAPIGetter('get-next-loan-amount', { userId: user.id })
  const nextLoanAmount = data?.amount ?? 0
  const receivedLoanToday = receivedTxnLoan || justReceivedLoan
  const notEligibleForLoan = nextLoanAmount < 1

  const getLoan = async () => {
    if (receivedLoanToday || notEligibleForLoan) {
      return
    }
    setLoaning(true)
    const res = await api('request-loan').catch((e) => {
      console.error(e)
      toast.error('Error requesting loan')
      return null
    })
    if (res) {
      await checkTxns()
      setJustReceivedLoan(true)
      toast.success(`Loan claimed! You received ${formatMoney(res.payout)}`)
    }
    setLoaning(false)
    track('request loan', {
      amount: res?.payout,
    })

    if (refreshPortfolio) {
      // Wait for replication...
      setTimeout(refreshPortfolio, 1000)
    }
  }

  useEffect(() => {
    if (isOpen && !user.hasSeenLoanModal)
      api('me/update', { hasSeenLoanModal: true })
  }, [isOpen, user.hasSeenLoanModal])

  const canClaimLoan = !receivedLoanToday && isEligible && !notEligibleForLoan

  return (
    <Modal open={isOpen} setOpen={setOpen} size="mdlg">
      <Col className="bg-canvas-0 text-ink-1000 max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <Col className="border-ink-200 gap-3 border-b px-6 pb-4 pt-6">
          <Row className="items-center gap-3">
            <div className="text-4xl">🏦</div>
            <Col className="gap-0.5">
              <h2 className="text-ink-900 text-xl font-semibold">
                Daily margin loans
              </h2>
              <p className="text-ink-600 text-sm">
                Leverage your positions with daily loans
              </p>
            </Col>
          </Row>
        </Col>

        {/* Key Metrics */}
        <Row className="border-ink-100 gap-3 border-b px-6 py-4">
          <Col className="flex-1 gap-1">
            <span className="text-ink-500 text-xs font-medium uppercase tracking-wide">
              Outstanding loan
            </span>
            <span className="text-ink-900 text-2xl font-semibold">
              {latestPortfolio
                ? formatMoney(latestPortfolio.loanTotal ?? 0)
                : formatMoney(0)}
            </span>
          </Col>
          {nextLoanAmount >= 1 && (
            <Col className="border-ink-200 flex-1 gap-1 border-l pl-3">
              <span className="text-ink-500 text-xs font-medium uppercase tracking-wide">
                Available today
              </span>
              <span className="text-primary-600 text-2xl font-semibold">
                {formatMoney(nextLoanAmount)}
              </span>
            </Col>
          )}
        </Row>

        {/* Status Message */}
        {receivedLoanToday ? (
          <div className="mx-6 mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              <span className="font-medium">Loan already collected today.</span>{' '}
              Come back tomorrow
              {nextLoanAmount > 0 && ` for ${formatMoney(nextLoanAmount)}`}!
            </p>
          </div>
        ) : !isEligible || nextLoanAmount < 1 ? (
          <div className="bg-ink-50 border-ink-200 mx-6 mt-4 rounded-lg border p-3">
            <p className="text-ink-700 text-sm">
              <span className="font-medium">
                Not eligible for a loan right now.
              </span>{' '}
              {!user?.lastBetTime || !latestPortfolio
                ? `Make your first ${TRADE_TERM} and come back in an hour to become eligible.`
                : latestPortfolio.investmentValue <= 0
                ? `Your investment value is at or below 0. Place some ${TRADE_TERM}s to become eligible.`
                : overLeveraged(
                    latestPortfolio.loanTotal,
                    latestPortfolio.investmentValue
                  )
                ? `You are over-leveraged. Sell some of your positions or place some good ${TRADE_TERM}s to become eligible.`
                : latestPortfolio.loanTotal && nextLoanAmount < 1
                ? `We've already loaned you up to the current value of your ${TRADE_TERM}s. Place some more ${TRADE_TERM}s to become eligible again.`
                : ''}
            </p>
          </div>
        ) : null}

        {/* Information Section */}
        <Col className="gap-4 px-6 py-5">
          <Col className="gap-3">
            <h3 className="text-ink-900 text-sm font-semibold">How it works</h3>
            <Col className="text-ink-700 gap-3 text-sm">
              <div>
                <p className="text-ink-900 mb-1 font-medium">
                  Daily loan amount
                </p>
                <p>
                  Each day, get a loan of {LOAN_DAILY_RATE * 100}% of your
                  investment value (max{' '}
                  {formatPercent(MAX_LOAN_NET_WORTH_PERCENT)} of net worth per
                  market).
                </p>
              </div>
              <div>
                <p className="text-ink-900 mb-1 font-medium">Interest rate</p>
                <p>
                  {LOAN_DAILY_INTEREST_RATE * 100}% per day accrues on your
                  outstanding loan balance. Principal + interest is
                  automatically deducted when the question resolves or you sell.
                </p>
              </div>
              <div>
                <p className="text-ink-900 mb-1 font-medium">Example</p>
                <p>
                  {TRADE_TERM.charAt(0).toUpperCase() + TRADE_TERM.slice(1)}{' '}
                  {ENV_CONFIG.moneyMoniker}1,000 → get {ENV_CONFIG.moneyMoniker}
                  {LOAN_DAILY_RATE * 1000} back tomorrow, then{' '}
                  {formatMoney(
                    LOAN_DAILY_RATE * (1000 - LOAN_DAILY_RATE * 1000)
                  )}{' '}
                  the next day. Interest accrues daily on the total loan.
                </p>
              </div>
            </Col>
          </Col>

          <div className="bg-ink-200 h-px" />

          <Col className="gap-2">
            <div className="bg-primary-50 border-primary-200 flex items-center gap-2 rounded-lg border p-3">
              <span className="text-lg">💡</span>
              <p className="text-primary-900 text-sm">
                <span className="font-medium">
                  You're earning {formatPercent(ANNUAL_INTEREST_RATE)} annual
                  interest
                </span>{' '}
                on all your open positions, including trades made with loans.
              </p>
            </div>
          </Col>
        </Col>

        {/* CTA Section */}
        <div className="bg-canvas-0 border-ink-200 sticky bottom-0 border-t px-6 py-4">
          <Button
            color="green"
            size="xl"
            loading={loaning}
            disabled={loaning || !canClaimLoan}
            onClick={getLoan}
            className="w-full"
          >
            {nextLoanAmount >= 1
              ? `Claim ${formatMoney(nextLoanAmount)} loan`
              : 'Claim loan'}
          </Button>
        </div>
      </Col>
    </Modal>
  )
}
