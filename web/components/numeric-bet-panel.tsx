import clsx from 'clsx'
import { useState } from 'react'

import { getNumericBetsInfo } from 'common/new-bet'
import { Bet } from 'common/bet'
import {
  calculatePayoutAfterCorrectBet,
  getOutcomeProbability,
} from 'common/calculate'
import { NumericContract } from 'common/contract'
import { formatPercent, formatMoney } from 'common/util/format'

import { useUser } from 'web/hooks/use-user'
import { APIError, placeBet } from 'web/lib/firebase/api'
import { User } from 'web/lib/firebase/users'
import { BuyAmountInput } from './amount-input'
import { BucketInput } from './bucket-input'
import { Col } from './layout/col'
import { Row } from './layout/row'
import { Spacer } from './layout/spacer'
import { SignUpPrompt } from './sign-up-prompt'
import { track } from 'web/lib/service/analytics'

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

      <SignUpPrompt />
    </Col>
  )
}

function NumericBuyPanel(props: {
  contract: NumericContract
  user: User | null | undefined
  onBuySuccess?: () => void
}) {
  const { contract, user, onBuySuccess } = props

  const [bucketChoice, setBucketChoice] = useState<string | undefined>(
    undefined
  )

  const [value, setValue] = useState<number | undefined>(undefined)

  const [betAmount, setBetAmount] = useState<number | undefined>(undefined)

  const [error, setError] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [wasSubmitted, setWasSubmitted] = useState(false)

  function onBetChange(newAmount: number | undefined) {
    setWasSubmitted(false)
    setBetAmount(newAmount)
  }

  async function submitBet() {
    if (
      !user ||
      !betAmount ||
      bucketChoice === undefined ||
      value === undefined
    )
      return

    setError(undefined)
    setIsSubmitting(true)

    await placeBet({
      amount: betAmount,
      outcome: bucketChoice,
      value,
      contractId: contract.id,
    })
      .then((r) => {
        console.log('placed bet. Result:', r)
        setIsSubmitting(false)
        setWasSubmitted(true)
        setBetAmount(undefined)
        if (onBuySuccess) onBuySuccess()
      })
      .catch((e) => {
        if (e instanceof APIError) {
          setError(e.toString())
        } else {
          console.error(e)
          setError('Error placing bet')
        }
        setIsSubmitting(false)
      })

    track('bet', {
      location: 'numeric panel',
      outcomeType: contract.outcomeType,
      slug: contract.slug,
      contractId: contract.id,
      amount: betAmount,
      value,
    })
  }

  const betDisabled = isSubmitting || !betAmount || !bucketChoice || error

  const { newBet, newPool, newTotalShares, newTotalBets } = getNumericBetsInfo(
    value ?? 0,
    bucketChoice ?? 'NaN',
    betAmount ?? 0,
    contract
  )

  const { probAfter: outcomeProb, shares } = newBet

  const initialProb = bucketChoice
    ? getOutcomeProbability(contract, bucketChoice)
    : 0

  const currentPayout =
    betAmount && bucketChoice
      ? calculatePayoutAfterCorrectBet(
          {
            ...contract,
            pool: newPool,
            totalShares: newTotalShares,
            totalBets: newTotalBets,
          },
          {
            outcome: bucketChoice,
            amount: betAmount,
            shares,
          } as Bet
        )
      : 0

  const currentReturn =
    betAmount && bucketChoice ? (currentPayout - betAmount) / betAmount : 0
  const currentReturnPercent = formatPercent(currentReturn)

  return (
    <>
      <div className="my-3 text-left text-sm text-gray-500">
        Predicted value
      </div>

      <BucketInput
        contract={contract}
        isSubmitting={isSubmitting}
        onBucketChange={(v, b) => (setValue(v), setBucketChoice(b))}
      />

      <div className="my-3 text-left text-sm text-gray-500">Bet amount</div>
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
