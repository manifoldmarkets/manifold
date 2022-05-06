import clsx from 'clsx'
import { useState, useEffect } from 'react'
import { Bet } from '../../common/bet'
import {
  getOutcomeProbabilityAfterBet,
  calculateShares,
  calculatePayoutAfterCorrectBet,
} from '../../common/calculate'
import { NumericContract } from '../../common/contract'
import {
  formatPercent,
  formatWithCommas,
  formatMoney,
} from '../../common/util/format'
import { useFocus } from '../hooks/use-focus'
import { useUser } from '../hooks/use-user'
import { placeBet } from '../lib/firebase/api-call'
import { firebaseLogin, User } from '../lib/firebase/users'
import { BucketAmountInput, BuyAmountInput } from './amount-input'
import { InfoTooltip } from './info-tooltip'
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
  const { bucketCount, min, max } = contract

  const [bucketChoice, setBucketChoice] = useState<string | undefined>(
    undefined
  )
  const [betAmount, setBetAmount] = useState<number | undefined>(undefined)
  const [error, setError] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [wasSubmitted, setWasSubmitted] = useState(false)

  const [inputRef, focusAmountInput] = useFocus()

  useEffect(() => {
    focusAmountInput()
  }, [focusAmountInput])

  function onBetChange(newAmount: number | undefined) {
    setWasSubmitted(false)
    setBetAmount(newAmount)
  }

  async function submitBet() {
    if (!user || !betAmount) return

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

  const betDisabled = isSubmitting || !betAmount || error

  const initialProb = 0
  const outcomeProb = getOutcomeProbabilityAfterBet(
    contract,
    bucketChoice || 'YES',
    betAmount ?? 0
  )
  const resultProb = bucketChoice === 'NO' ? 1 - outcomeProb : outcomeProb

  const shares = calculateShares(
    contract,
    betAmount ?? 0,
    bucketChoice || 'YES'
  )

  const currentPayout = betAmount
    ? calculatePayoutAfterCorrectBet(contract, {
        outcome: bucketChoice,
        amount: betAmount,
        shares,
      } as Bet)
    : 0

  const currentReturn = betAmount ? (currentPayout - betAmount) / betAmount : 0
  const currentReturnPercent = formatPercent(currentReturn)

  const dpmTooltip =
    contract.mechanism === 'dpm-2'
      ? `Current payout for ${formatWithCommas(shares)} / ${formatWithCommas(
          shares +
            contract.totalShares[bucketChoice ?? 'YES'] -
            (contract.phantomShares
              ? contract.phantomShares[bucketChoice ?? 'YES']
              : 0)
        )} ${bucketChoice ?? 'YES'} shares`
      : undefined
  return (
    <>
      <div className="my-3 text-left text-sm text-gray-500">Numeric value</div>
      <BucketAmountInput
        bucket={bucketChoice ? +bucketChoice : undefined}
        bucketCount={bucketCount}
        min={min}
        max={max}
        inputClassName="w-full max-w-none"
        onChange={(bucket) => setBucketChoice(bucket ? `${bucket}` : undefined)}
        error={error}
        setError={setError}
        disabled={isSubmitting}
        inputRef={inputRef}
      />

      <div className="my-3 text-left text-sm text-gray-500">Amount</div>
      <BuyAmountInput
        inputClassName="w-full max-w-none"
        amount={betAmount}
        onChange={onBetChange}
        error={error}
        setError={setError}
        disabled={isSubmitting}
        inputRef={inputRef}
      />

      <Col className="mt-3 w-full gap-3">
        <Row className="items-center justify-between text-sm">
          <div className="text-gray-500">Probability</div>
          <Row>
            <div>{formatPercent(initialProb)}</div>
            <div className="mx-2">→</div>
            <div>{formatPercent(resultProb)}</div>
          </Row>
        </Row>

        <Row className="items-center justify-between gap-2 text-sm">
          <Row className="flex-nowrap items-center gap-2 whitespace-nowrap text-gray-500">
            <div>
              {contract.mechanism === 'dpm-2' ? (
                <>
                  Estimated
                  <br /> payout if correct
                </>
              ) : (
                <>Payout if correct</>
              )}
            </div>

            {dpmTooltip && <InfoTooltip text={dpmTooltip} />}
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
            betDisabled
              ? 'btn-disabled'
              : bucketChoice === 'YES'
              ? 'btn-primary'
              : 'border-none bg-red-400 hover:bg-red-500',
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
