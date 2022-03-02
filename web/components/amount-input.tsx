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
  setError: (error: string | undefined) => void
  contractId: string | undefined
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
    contractId,
    disabled,
    className,
    inputClassName,
    minimumAmount,
    inputRef,
  } = props

  const user = useUser()

  const userBets = useUserContractBets(user?.id, contractId) ?? []
  const prevLoanAmount = _.sumBy(userBets, (bet) => bet.loanAmount ?? 0)

  const loanAmount = Math.min(
    amount ?? 0,
    MAX_LOAN_PER_CONTRACT - prevLoanAmount
  )

  const onAmountChange = (str: string) => {
    if (str.includes('-')) {
      onChange(undefined)
      return
    }
    const amount = parseInt(str.replace(/[^\d]/, ''))

    if (str && isNaN(amount)) return
    if (amount >= 10 ** 9) return

    onChange(str ? amount : undefined)

    if (user && user.balance < amount) {
      setError('Insufficient balance')
    } else if (minimumAmount && amount < minimumAmount) {
      setError('Minimum amount: ' + formatMoney(minimumAmount))
    } else {
      setError(undefined)
    }
  }

  const amountNetLoan = (amount ?? 0) - loanAmount
  const remainingBalance = Math.max(0, (user?.balance ?? 0) - amountNetLoan)

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
      {user && (
        <Col className="gap-3 text-sm">
          {contractId && (
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
    </Col>
  )
}
