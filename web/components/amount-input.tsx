import clsx from 'clsx'
import _ from 'lodash'
import { useUser } from '../hooks/use-user'
import { formatMoney } from '../../common/util/format'
import { Col } from './layout/col'
import { Row } from './layout/row'
import { useUserContractBets } from '../hooks/use-user-bets'
import { MAX_LOAN_PER_CONTRACT } from '../../common/bet'
import { InfoTooltip } from './info-tooltip'
import { Spacer } from './layout/spacer'

export function AmountInput(props: {
  amount: number | undefined
  onChange: (newAmount: number | undefined) => void
  error: string | undefined
  disabled?: boolean
  className?: string
  inputClassName?: string
  // Needed to focus the amount input
  inputRef?: React.MutableRefObject<any>
  children?: any
}) {
  const {
    amount,
    onChange,
    error,
    disabled,
    className,
    inputClassName,
    inputRef,
    children,
  } = props

  const onAmountChange = (str: string) => {
    if (str.includes('-')) {
      onChange(undefined)
      return
    }
    const amount = parseInt(str.replace(/[^\d]/, ''))

    if (str && isNaN(amount)) return
    if (amount >= 10 ** 9) return

    onChange(str ? amount : undefined)
  }

  return (
    <Col className={className}>
      <label className="input-group">
        <span className="bg-gray-200 text-sm">M$</span>
        <input
          className={clsx(
            'input input-bordered',
            error && 'input-error',
            inputClassName
          )}
          ref={inputRef}
          type="number"
          placeholder="0"
          maxLength={9}
          value={amount ?? ''}
          disabled={disabled}
          onChange={(e) => onAmountChange(e.target.value)}
        />
      </label>

      <Spacer h={4} />

      {error && (
        <div className="mb-2 mr-auto self-center whitespace-nowrap text-xs font-medium tracking-wide text-red-500">
          {error}
        </div>
      )}

      {children}
    </Col>
  )
}

export function BuyAmountInput(props: {
  amount: number | undefined
  onChange: (newAmount: number | undefined) => void
  error: string | undefined
  setError: (error: string | undefined) => void
  contractIdForLoan: string | undefined
  minimumAmount?: number
  disabled?: boolean
  className?: string
  inputClassName?: string
  // Needed to focus the amount input
  inputRef?: React.MutableRefObject<any>
}) {
  const {
    amount,
    onChange,
    error,
    setError,
    contractIdForLoan,
    disabled,
    className,
    inputClassName,
    minimumAmount,
    inputRef,
  } = props

  const user = useUser()

  const userBets = useUserContractBets(user?.id, contractIdForLoan) ?? []
  const openUserBets = userBets.filter((bet) => !bet.isSold && !bet.sale)
  const prevLoanAmount = _.sumBy(openUserBets, (bet) => bet.loanAmount ?? 0)

  const loanAmount = contractIdForLoan
    ? Math.min(amount ?? 0, MAX_LOAN_PER_CONTRACT - prevLoanAmount)
    : 0

  const amountNetLoan = (amount ?? 0) - loanAmount
  const remainingBalance = Math.max(0, (user?.balance ?? 0) - amountNetLoan)

  const onAmountChange = (amount: number | undefined) => {
    onChange(amount)

    // Check for errors.
    if (amount !== undefined) {
      const amountNetLoan = amount - loanAmount

      if (user && user.balance < amountNetLoan) {
        setError('Insufficient balance')
      } else if (minimumAmount && amount < minimumAmount) {
        setError('Minimum amount: ' + formatMoney(minimumAmount))
      } else {
        setError(undefined)
      }
    }
  }

  return (
    <AmountInput
      amount={amount}
      onChange={onAmountChange}
      error={error}
      disabled={disabled}
      className={className}
      inputClassName={inputClassName}
      inputRef={inputRef}
    >
      {user && (
        <Col className="gap-3 text-sm">
          {contractIdForLoan && (
            <Row className="items-center justify-between gap-2 text-gray-500">
              <Row className="items-center gap-2">
                Amount loaned{' '}
                <InfoTooltip
                  text={`In every market, you get an interest-free loan on the first ${formatMoney(
                    MAX_LOAN_PER_CONTRACT
                  )}.`}
                />
              </Row>
              <span className="text-neutral">{formatMoney(loanAmount)}</span>{' '}
            </Row>
          )}
          <Row className="items-center justify-between gap-2 text-gray-500">
            Remaining balance{' '}
            <span className="text-neutral">
              {formatMoney(Math.floor(remainingBalance))}
            </span>
          </Row>
        </Col>
      )}
    </AmountInput>
  )
}
