import clsx from 'clsx'
import { useState } from 'react'
import { Bet } from '../../common/bet'
import {
  getOutcomeProbabilityAfterBet,
  calculateShares,
  calculatePayoutAfterCorrectBet,
  getOutcomeProbability,
} from '../../common/calculate'
import { getMappedBucket, getNumericBets } from '../../common/calculate-dpm'
import { NumericContract } from '../../common/contract'
import { formatPercent, formatMoney } from '../../common/util/format'
import { useUser } from '../hooks/use-user'
import { placeBet } from '../lib/firebase/api-call'
import { firebaseLogin, User } from '../lib/firebase/users'
import { BucketAmountInput, BuyAmountInput } from './amount-input'
import { Col } from './layout/col'
import { Row } from './layout/row'
import { Spacer } from './layout/spacer'

export function NumericBetPanel(props: {
  contract: NumericContract
  className?: string
}) {
  const { contract, className } = props
  const user = useUser()

  return (
    <Col className={clsx('rounded-md bg-white px-8 py-6', className)}>
      <div className="mb-6 text-2xl">Place your bet</div>

      <NumericBuyPanel contract={contract} user={user} />

      {user === null && (
        <button
          className="btn flex-1 whitespace-nowrap border-none bg-gradient-to-r from-teal-500 to-green-500 px-10 text-lg font-medium normal-case hover:from-teal-600 hover:to-green-600"
          onClick={firebaseLogin}
        >
          Sign up to trade!
        </button>
      )}
    </Col>
  )
}

function NumericBuyPanel(props: {
  contract: NumericContract
  user: User | null | undefined
  onBuySuccess?: () => void
}) {
  const { contract, user, onBuySuccess } = props
  const { min, max } = contract

  const [bucket, setBucketChoice] = useState<number | undefined>(undefined)
  const bucketChoice = bucket === undefined ? undefined : `${bucket}`
  const [betAmount, setBetAmount] = useState<number | undefined>(undefined)
  const [valueError, setValueError] = useState<string | undefined>()
  const [error, setError] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [wasSubmitted, setWasSubmitted] = useState(false)

  function onBucketChange(newBucket: number | undefined) {
    setBucketChoice(newBucket)
    setWasSubmitted(false)
  }

  function onBetChange(newAmount: number | undefined) {
    setWasSubmitted(false)
    setBetAmount(newAmount)
  }

  async function submitBet() {
    if (!user || !betAmount || bucket === undefined) return

    const bucketChoice = getMappedBucket(bucket, contract)

    setError(undefined)
    setIsSubmitting(true)

    const result = await placeBet({
      amount: betAmount,
      outcome: bucketChoice,
      contractId: contract.id,
    }).then((r) => r.data as any)

    console.log('placed bet. Result:', result)

    if (result?.status === 'success') {
      setIsSubmitting(false)
      setWasSubmitted(true)
      setBetAmount(undefined)
      if (onBuySuccess) onBuySuccess()
    } else {
      setError(result?.message || 'Error placing bet')
      setIsSubmitting(false)
    }
  }

  const betDisabled = isSubmitting || !betAmount || !bucketChoice || error

  const initialProb = bucketChoice
    ? getOutcomeProbability(contract, bucketChoice)
    : 0
  const numericBets =
    bucketChoice && betAmount
      ? getNumericBets(contract, bucketChoice, betAmount)
      : []
  const outcomeBet = numericBets.find(([choice]) => choice === bucketChoice)
  const outcomeProb =
    bucketChoice && outcomeBet
      ? getOutcomeProbabilityAfterBet(contract, bucketChoice, outcomeBet[1])
      : initialProb

  const shares = bucketChoice
    ? calculateShares(contract, betAmount ?? 0, bucketChoice)
    : initialProb

  const currentPayout =
    betAmount && bucketChoice
      ? calculatePayoutAfterCorrectBet(contract, {
          outcome: bucketChoice,
          amount: betAmount,
          shares,
        } as Bet)
      : 0

  const currentReturn =
    betAmount && bucketChoice ? (currentPayout - betAmount) / betAmount : 0
  const currentReturnPercent = formatPercent(currentReturn)

  return (
    <>
      <div className="my-3 text-left text-sm text-gray-500">Numeric value</div>
      <BucketAmountInput
        bucket={bucketChoice ? +bucketChoice : undefined}
        min={min}
        max={max}
        inputClassName="w-full max-w-none"
        onChange={onBucketChange}
        error={valueError}
        setError={setValueError}
        disabled={isSubmitting}
      />

      <div className="my-3 text-left text-sm text-gray-500">Amount</div>
      <BuyAmountInput
        inputClassName="w-full max-w-none"
        amount={betAmount}
        onChange={onBetChange}
        error={error}
        setError={setError}
        disabled={isSubmitting}
      />

      <Col className="mt-3 w-full gap-3">
        <Row className="items-center justify-between text-sm">
          <div className="text-gray-500">Probability</div>
          <Row>
            <div>{formatPercent(initialProb)}</div>
            <div className="mx-2">→</div>
            <div>{formatPercent(outcomeProb)}</div>
          </Row>
        </Row>

        <Row className="items-center justify-between gap-2 text-sm">
          <Row className="flex-nowrap items-center gap-2 whitespace-nowrap text-gray-500">
            <div>
              Estimated
              <br /> payout if correct
            </div>
          </Row>
          <Row className="flex-wrap items-end justify-end gap-2">
            <span className="whitespace-nowrap">
              {formatMoney(currentPayout)}
            </span>
            <span>(+{currentReturnPercent})</span>
          </Row>
        </Row>
      </Col>

      <Spacer h={8} />

      {user && (
        <button
          className={clsx(
            'btn flex-1',
            betDisabled ? 'btn-disabled' : 'btn-primary',
            isSubmitting ? 'loading' : ''
          )}
          onClick={betDisabled ? undefined : submitBet}
        >
          {isSubmitting ? 'Submitting...' : 'Submit bet'}
        </button>
      )}

      {wasSubmitted && <div className="mt-4">Bet submitted!</div>}
    </>
  )
}
