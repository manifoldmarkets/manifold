import clsx from 'clsx'
import _ from 'lodash'
import { useUser } from '../hooks/use-user'
import { formatMoney, formatWithCommas } from '../../common/util/format'
import { Col } from './layout/col'
import { Row } from './layout/row'
import { Bet, MAX_LOAN_PER_CONTRACT } from '../../common/bet'
import { InfoTooltip } from './info-tooltip'
import { Spacer } from './layout/spacer'
import { calculateCpmmSale } from '../../common/calculate-cpmm'
import { Binary, CPMM, FullContract } from '../../common/contract'

export function AmountInput(props: {
  amount: number | undefined
  onChange: (newAmount: number | undefined) => void
  error: string | undefined
  label: string
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
    label,
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
        <span className="bg-gray-200 text-sm">{label}</span>
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
  userBets?: Bet[]
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
    userBets,
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

  const openUserBets = (userBets ?? []).filter(
    (bet) => !bet.isSold && !bet.sale
  )
  const prevLoanAmount = _.sumBy(openUserBets, (bet) => bet.loanAmount ?? 0)

  const loanAmount = contractIdForLoan
    ? Math.min(amount ?? 0, MAX_LOAN_PER_CONTRACT - prevLoanAmount)
    : 0

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
      label="M$"
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
        </Col>
      )}
    </AmountInput>
  )
}

export function SellAmountInput(props: {
  contract: FullContract<CPMM, Binary>
  amount: number | undefined
  onChange: (newAmount: number | undefined) => void
  userBets: Bet[]
  error: string | undefined
  setError: (error: string | undefined) => void
  disabled?: boolean
  className?: string
  inputClassName?: string
  // Needed to focus the amount input
  inputRef?: React.MutableRefObject<any>
}) {
  const {
    contract,
    amount,
    onChange,
    userBets,
    error,
    setError,
    disabled,
    className,
    inputClassName,
    inputRef,
  } = props

  const user = useUser()

  const openUserBets = userBets.filter((bet) => !bet.isSold && !bet.sale)
  const [yesBets, noBets] = _.partition(
    openUserBets,
    (bet) => bet.outcome === 'YES'
  )
  const [yesShares, noShares] = [
    _.sumBy(yesBets, (bet) => bet.shares),
    _.sumBy(noBets, (bet) => bet.shares),
  ]

  const sellOutcome = yesShares ? 'YES' : noShares ? 'NO' : undefined
  const shares = yesShares || noShares

  const prevLoanAmount = _.sumBy(openUserBets, (bet) => bet.loanAmount ?? 0)

  const sharesSold = Math.min(amount ?? 0, yesShares || noShares)
  const { saleValue } = calculateCpmmSale(contract, {
    shares: sharesSold,
    outcome: sellOutcome as 'YES' | 'NO',
  })

  const loanRepaid = Math.min(prevLoanAmount, saleValue)

  const onAmountChange = (amount: number | undefined) => {
    onChange(amount)

    // Check for errors.
    if (amount !== undefined) {
      console.log(shares, amount)
      if (amount > shares) {
        setError(`Maximum ${formatWithCommas(Math.floor(shares))} shares`)
      } else {
        setError(undefined)
      }
    }
  }

  return (
    <AmountInput
      amount={amount}
      onChange={onAmountChange}
      label="Qty"
      error={error}
      disabled={disabled}
      className={className}
      inputClassName={inputClassName}
      inputRef={inputRef}
    >
      {user && (
        <Col className="gap-3 text-sm">
          <Row className="items-center justify-between gap-2 text-gray-500">
            Sale proceeds{' '}
            <span className="text-neutral">{formatMoney(saleValue)}</span>
          </Row>
          {prevLoanAmount && (
            <Row className="items-center justify-between gap-2 text-gray-500">
              <Row className="items-center gap-2">
                Loan repaid{' '}
                <InfoTooltip
                  text={`Sold shares go toward paying off loans first.`}
                />
              </Row>
              <span className="text-neutral">{formatMoney(loanRepaid)}</span>{' '}
            </Row>
          )}
        </Col>
      )}
    </AmountInput>
  )
}
