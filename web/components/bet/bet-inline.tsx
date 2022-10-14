import { track } from '@amplitude/analytics-browser'
import clsx from 'clsx'
import { useMutation } from 'react-query'
import { XIcon } from '@heroicons/react/solid'

import { CPMMBinaryContract, PseudoNumericContract } from 'common/contract'
import { getBinaryCpmmBetInfo } from 'common/new-bet'
import { APIError } from 'web/lib/firebase/api'
import { useEffect, useState } from 'react'
import { placeBet } from 'web/lib/firebase/api'
import { BuyAmountInput } from '../amount-input'
import { Button } from '../buttons/button'
import { Row } from '../layout/row'
import { YesNoSelector } from './yes-no-selector'
import { useUnfilledBetsAndBalanceByUserId } from 'web/hooks/use-bets'
import { useUser } from 'web/hooks/use-user'
import { BetSignUpPrompt } from '../sign-up-prompt'
import { getCpmmProbability } from 'common/calculate-cpmm'
import { Col } from '../layout/col'
import { formatMoney } from 'common/util/format'

// adapted from bet-panel.ts
export function BetInline(props: {
  contract: CPMMBinaryContract | PseudoNumericContract
  className?: string
  setProbAfter: (probAfter: number | undefined) => void
  onClose: () => void
}) {
  const { contract, className, setProbAfter, onClose } = props

  const user = useUser()

  const [outcome, setOutcome] = useState<'YES' | 'NO'>('YES')
  const [amount, setAmount] = useState<number>()
  const [error, setError] = useState<string>()

  const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'
  const { unfilledBets, balanceByUserId } = useUnfilledBetsAndBalanceByUserId(
    contract.id
  )

  const { newPool, newP } = getBinaryCpmmBetInfo(
    outcome ?? 'YES',
    amount ?? 0,
    contract,
    undefined,
    unfilledBets,
    balanceByUserId
  )
  const resultProb = getCpmmProbability(newPool, newP)
  useEffect(() => setProbAfter(resultProb), [setProbAfter, resultProb])

  const submitBet = useMutation(
    () => placeBet({ outcome, amount, contractId: contract.id }),
    {
      onError: (e) =>
        setError(e instanceof APIError ? e.toString() : 'Error placing bet'),
      onSuccess: () => {
        track('bet', {
          location: 'embed',
          outcomeType: contract.outcomeType,
          slug: contract.slug,
          contractId: contract.id,
          amount,
          outcome,
          isLimitOrder: false,
        })
        setAmount(undefined)
      },
    }
  )

  // reset error / success state on user change
  useEffect(() => {
    amount && submitBet.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcome, amount])

  const tooFewFunds = error === 'Insufficient balance'

  const betDisabled = submitBet.isLoading || tooFewFunds || !amount

  return (
    <Col className={clsx('items-center', className)}>
      <Row className="h-12 items-stretch gap-3 rounded bg-indigo-200 py-2 px-3">
        <div className="text-xl">Predict</div>
        <YesNoSelector
          className="space-x-0"
          btnClassName="rounded-l-none rounded-r-none first:rounded-l-2xl last:rounded-r-2xl"
          selected={outcome}
          onSelect={setOutcome}
          isPseudoNumeric={isPseudoNumeric}
        />
        <BuyAmountInput
          className="-mb-4"
          inputClassName="w-20 !text-base"
          amount={amount}
          onChange={setAmount}
          error="" // handle error ourselves
          setError={setError}
        />
        {user && (
          <Button
            color={({ YES: 'green', NO: 'red' } as const)[outcome]}
            size="xs"
            disabled={betDisabled}
            onClick={() => submitBet.mutate()}
          >
            {submitBet.isLoading
              ? 'Submitting'
              : submitBet.isSuccess
              ? 'Success!'
              : 'Submit'}
          </Button>
        )}
        <BetSignUpPrompt size="xs" />
        <button
          onClick={() => {
            setProbAfter(undefined)
            onClose()
          }}
        >
          <XIcon className="ml-1 h-6 w-6" />
        </button>
      </Row>
      {error && (
        <div className="text-error my-1 text-sm">
          {error} {tooFewFunds && `(${formatMoney(user?.balance ?? 0)})`}
        </div>
      )}
    </Col>
  )
}
