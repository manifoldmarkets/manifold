import clsx from 'clsx'
import { useUser } from '../hooks/use-user'
import { formatMoney } from '../lib/util/format'
import { AddFundsButton } from './add-funds-button'
import { Col } from './layout/col'
import { Row } from './layout/row'

export function AmountInput(props: {
  amount: number | undefined
  onChange: (newAmount: number | undefined) => void
  error: string | undefined
  setError: (error: string | undefined) => void
  disabled?: boolean
  className?: string
  inputClassName?: string
}) {
  const {
    amount,
    onChange,
    error,
    setError,
    disabled,
    className,
    inputClassName,
  } = props

  const user = useUser()

  const onAmountChange = (str: string) => {
    const amount = parseInt(str.replace(/[^\d]/, ''))

    if (str && isNaN(amount)) return

    onChange(str ? amount : undefined)

    if (user && user.balance < amount) setError('Insufficient balance')
    else setError(undefined)
  }

  const remainingBalance = (user?.balance ?? 0) - (amount ?? 0)

  return (
    <Col className={className}>
      <label className="input-group">
        <span className="text-sm bg-gray-200">M$</span>
        <input
          className={clsx(
            'input input-bordered',
            error && 'input-error',
            inputClassName
          )}
          type="text"
          placeholder="0"
          maxLength={9}
          value={amount ?? ''}
          disabled={disabled}
          onChange={(e) => onAmountChange(e.target.value)}
        />
      </label>
      {user && (
        <Row className="text-sm text-gray-500 justify-between mt-3 gap-4 items-end">
          {error ? (
            <div className="font-medium tracking-wide text-red-500 text-xs whitespace-nowrap mr-auto self-center">
              {error}
            </div>
          ) : (
            <Col>
              <div className="whitespace-nowrap">Remaining balance</div>
              <div className="text-neutral mt-1">
                {formatMoney(Math.floor(remainingBalance))}
              </div>
            </Col>
          )}
          {user.balance !== 1000 && <AddFundsButton className="mt-1" />}
        </Row>
      )}
    </Col>
  )
}
