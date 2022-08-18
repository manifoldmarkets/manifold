import { track } from '@amplitude/analytics-browser'
import clsx from 'clsx'
import { CPMMBinaryContract, PseudoNumericContract } from 'common/contract'
import { getBinaryCpmmBetInfo } from 'common/new-bet'
import { APIError } from 'web/lib/firebase/api'
import { useEffect, useState } from 'react'
import { useMutation } from 'react-query'
import { placeBet } from 'web/lib/firebase/api'
import { BuyAmountInput } from './amount-input'
import { Button } from './button'
import { Row } from './layout/row'
import { YesNoSelector } from './yes-no-selector'
import { useUnfilledBets } from 'web/hooks/use-bets'
import { useUser } from 'web/hooks/use-user'
import { SignUpPrompt } from './sign-up-prompt'
import { getCpmmProbability } from 'common/calculate-cpmm'

// adapted from bet-panel.ts
export function BetInline(props: {
  contract: CPMMBinaryContract | PseudoNumericContract
  className?: string
  setProbAfter: (probAfter: number) => void
}) {
  const { contract, className, setProbAfter: setResult } = props

  const user = useUser()

  const [outcome, setOutcome] = useState<'YES' | 'NO'>('YES')
  const [amount, setAmount] = useState<number>()
  const [error, setError] = useState<string>()

  const isPseudoNumeric = contract.outcomeType === 'PSEUDO_NUMERIC'
  const unfilledBets = useUnfilledBets(contract.id) ?? []

  const { newPool, newP } = getBinaryCpmmBetInfo(
    outcome ?? 'YES',
    amount ?? 0,
    contract,
    undefined,
    unfilledBets
  )
  const resultProb = getCpmmProbability(newPool, newP)
  useEffect(() => setResult(resultProb), [resultProb])

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
      },
    }
  )

  const betDisabled = submitBet.isLoading || submitBet.isError || !amount

  return (
    <Row className={clsx('h-8 items-stretch justify-center gap-3', className)}>
      <div className="text-xl">Bet</div>
      <YesNoSelector
        className="space-x-0"
        btnClassName="rounded-none first:rounded-l-2xl last:rounded-r-2xl"
        selected={outcome}
        onSelect={setOutcome}
        isPseudoNumeric={isPseudoNumeric}
      />
      <BuyAmountInput
        className="-mb-4"
        inputClassName={clsx(
          'input-sm w-[100px] !text-base',
          error && 'input-error'
        )}
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
      <SignUpPrompt size="xs" />
    </Row>
  )
}
