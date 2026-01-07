import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { PLURAL_BETS, User } from 'common/user'
import { ENV_CONFIG, TRADE_TERM } from 'common/envs/constants'
import {
  LOAN_DAILY_RATE,
  MAX_BALANCE_FOR_LOAN,
  overLeveraged,
} from 'common/loans'
import { useHasReceivedLoanToday } from 'web/hooks/use-has-received-loan'
import { useIsEligibleForLoans } from 'web/hooks/use-is-eligible-for-loans'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { formatMoney, formatPercent } from 'common/util/format'
import { MAX_LOAN_NET_WORTH_PERCENT } from 'common/loans'
export function LoansModal(props: {
  user: User
  isOpen: boolean
  setOpen: (open: boolean) => void
}) {
  const { isOpen, user, setOpen } = props
  const { receivedLoanToday } = useHasReceivedLoanToday(user)
  const { latestPortfolio, isEligible } = useIsEligibleForLoans(user.id)
  const { data } = useAPIGetter('get-next-loan-amount', { userId: user.id })
  const nextLoanAmount = data?.amount ?? 0
  return (
    <Modal open={isOpen} setOpen={setOpen}>
      <Col className="bg-canvas-0 text-ink-1000 max-h-[80vh] items-center gap-3 overflow-y-auto rounded-md px-8 py-6">
        <span className={'text-5xl'}>🏦</span>
        <span className="text-lg font-semibold">Daily margin loans</span>
        {receivedLoanToday ? (
          <span className={'text-ink-600 text-sm italic'}>
            You have already received your loan today. Come back tomorrow for{' '}
            {nextLoanAmount > 0 && formatMoney(nextLoanAmount)}!
          </span>
        ) : !isEligible || nextLoanAmount < 1 ? (
          <span className={'text-ink-600 text-sm italic'}>
            You're not eligible for a loan right now.{' '}
            {user.balance >= MAX_BALANCE_FOR_LOAN
              ? `You must have less than ${formatMoney(
                  MAX_BALANCE_FOR_LOAN
                )} to claim a loan.`
              : !user?.lastBetTime || !latestPortfolio
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
          </span>
        ) : null}
        <Col className={'gap-1.5 text-sm'}>
          <span className={'text-primary-700 font-medium'}>
            • What are loans?
          </span>
          <span className={'ml-2'}>
            Each day, get a 0% interest loan of {LOAN_DAILY_RATE * 100}% of your
            investment value (max {formatPercent(MAX_LOAN_NET_WORTH_PERCENT)} of
            net worth per market). Requires balance under{' '}
            {formatMoney(MAX_BALANCE_FOR_LOAN)}.
          </span>
          <span className={'text-primary-700 font-medium'}>
            • Do I have to pay back a loan?
          </span>
          <span className={'ml-2'}>
            Yes, automatically when the question resolves or you sell.
          </span>
          <span className={'text-primary-700 font-medium'}>• Example</span>
          <span className={'ml-2'}>
            {TRADE_TERM.charAt(0).toUpperCase() + TRADE_TERM.slice(1)}{' '}
            {ENV_CONFIG.moneyMoniker}1000 → get {ENV_CONFIG.moneyMoniker}
            {LOAN_DAILY_RATE * 1000} back tomorrow, then{' '}
            {formatMoney(LOAN_DAILY_RATE * (1000 - LOAN_DAILY_RATE * 1000))} the
            next day.
          </span>
        </Col>
      </Col>
    </Modal>
  )
}
