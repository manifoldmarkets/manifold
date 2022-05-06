import clsx from 'clsx'
import _ from 'lodash'
import { useUser } from '../hooks/use-user'
import { formatMoney, formatWithCommas } from '../../common/util/format'
import { Col } from './layout/col'
import { Row } from './layout/row'
import { Bet } from '../../common/bet'
import { Spacer } from './layout/spacer'
import { calculateCpmmSale } from '../../common/calculate-cpmm'
import { Binary, CPMM, FullContract } from '../../common/contract'
import { SiteLink } from './site-link'

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
    const amount = parseInt(str.replace(/\D/g, ''))
    const isInvalid = !str || isNaN(amount)
    onChange(isInvalid ? undefined : amount)
  }

  return (
    <Col className={className}>
      <label className="input-group">
        <span className="bg-gray-200 text-sm">{label}</span>
        <input
          className={clsx(
            'input input-bordered max-w-[200px] text-lg',
            error && 'input-error',
            inputClassName
          )}
          ref={inputRef}
          type="text"
          pattern="[0-9]*"
          inputMode="numeric"
          placeholder="0"
          maxLength={6}
          value={amount ?? ''}
          disabled={disabled}
          onChange={(e) => onAmountChange(e.target.value)}
        />
      </label>

      <Spacer h={4} />

      {error && (
        <div className="mb-2 mr-auto self-center whitespace-nowrap text-xs font-medium tracking-wide text-red-500">
          {error === 'Insufficient balance' ? (
            <>
              Not enough funds.
              <span className="ml-1 text-indigo-500">
                <SiteLink href="/add-funds">Buy more?</SiteLink>
              </span>
            </>
          ) : (
            error
          )}
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

  const onAmountChange = (amount: number | undefined) => {
    onChange(amount)

    // Check for errors.
    if (amount !== undefined) {
      if (user && user.balance < amount) {
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
    />
  )
}

export function BucketAmountInput(props: {
  bucket: number | undefined
  bucketCount: number
  min: number
  max: number
  onChange: (newBucket: number | undefined) => void
  error: string | undefined
  setError: (error: string | undefined) => void
  disabled?: boolean
  className?: string
  inputClassName?: string
  // Needed to focus the amount input
  inputRef?: React.MutableRefObject<any>
}) {
  const {
    bucket,
    bucketCount,
    min,
    max,
    onChange,
    error,
    setError,
    disabled,
    className,
    inputClassName,
    inputRef,
  } = props

  const onBucketChange = (bucket: number | undefined) => {
    onChange(bucket)

    // Check for errors.
    if (bucket !== undefined) {
      if (bucket < 0 || bucket >= bucketCount) {
        setError('Enter a number between 0 and ' + (bucketCount - 1))
      } else {
        setError(undefined)
      }
    }
  }

  return (
    <AmountInput
      amount={bucket}
      onChange={onBucketChange}
      label="Value"
      error={error}
      disabled={disabled}
      className={className}
      inputClassName={inputClassName}
      inputRef={inputRef}
    />
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
  const shares = Math.round(yesShares) || Math.round(noShares)

  const sharesSold = Math.min(amount ?? 0, shares)

  const { saleValue } = calculateCpmmSale(
    contract,
    sharesSold,
    sellOutcome as 'YES' | 'NO'
  )

  const onAmountChange = (amount: number | undefined) => {
    onChange(amount)

    // Check for errors.
    if (amount !== undefined) {
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
        </Col>
      )}
    </AmountInput>
  )
}
