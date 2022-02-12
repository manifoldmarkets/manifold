import clsx from 'clsx'
import { useUser } from '../hooks/use-user'
import { formatMoney } from '../../common/util/format'
import { AddFundsButton } from './add-funds-button'
import { Col } from './layout/col'
import { Row } from './layout/row'

export function AmountInput(props: {
  amount: number | undefined
  onChange: (newAmount: number | undefined) => void
  error: string | undefined
  setError: (error: string | undefined) => void
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
    disabled,
    className,
    inputClassName,
    minimumAmount,
    inputRef,
  } = props

  const user = useUser()

  const onAmountChange = (str: string) => {
    const amount = parseInt(str.replace(/[^\d]/, ''))

    if (str && isNaN(amount)) return

    onChange(str ? amount : undefined)

    if (user && user.balance < amount) {
      setError('Insufficient balance')
    } else if (minimumAmount && amount < minimumAmount) {
      setError('Minimum amount: ' + formatMoney(minimumAmount))
    } else {
      setError(undefined)
    }
  }

  const remainingBalance = Math.max(0, (user?.balance ?? 0) - (amount ?? 0))

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
      {error && (
        <div className="mr-auto mt-4 self-center whitespace-nowrap text-xs font-medium tracking-wide text-red-500">
          {error}
        </div>
      )}
      {user && (
        <Col className="mt-3 text-sm">
          <div className="mb-2 whitespace-nowrap text-gray-500">
            Remaining balance
          </div>
          <Row className="gap-4">
            <div>{formatMoney(Math.floor(remainingBalance))}</div>
            {user.balance !== 1000 && <AddFundsButton />}
          </Row>
        </Col>
      )}
    </Col>
  )
}
