import { XIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { useState } from 'react'

import { Answer, DpmAnswer } from 'common/answer'
import { Bet } from 'common/bet'
import {
  calculateSharesBought,
  getAnswerProbability,
  getOutcomeProbabilityAfterBet,
} from 'common/calculate'
import { calculateDpmPayoutAfterCorrectBet } from 'common/calculate-dpm'
import { CPMMMultiContract, MultiContract } from 'common/contract'
import { User } from 'common/user'
import {
  formatMoney,
  formatPercent,
  formatWithCommas,
} from 'common/util/format'
import { removeUndefinedProps } from 'common/util/object'
import { useUser } from 'web/hooks/use-user'
import { APIError, api } from 'web/lib/firebase/api'
import { track } from 'web/lib/service/analytics'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { BuyAmountInput } from 'web/components/widgets/amount-input'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { Spacer } from 'web/components/layout/spacer'
import { WarningConfirmationButton } from 'web/components/buttons/warning-confirmation-button'
import { BetSignUpPrompt } from 'web/components/sign-up-prompt'
import { Subtitle } from 'web/components/widgets/subtitle'
import { BuyPanel } from 'web/components/bet/bet-panel'

export function AnswerBetPanel(props: {
  answer: DpmAnswer
  contract: MultiContract
  closePanel: () => void
  className?: string
}) {
  const { answer, contract, closePanel, className } = props
  const { id: answerId } = answer

  const user = useUser()
  const [betAmount, setBetAmount] = useState<number | undefined>(undefined)

  const [error, setError] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function submitBet() {
    if (!user || !betAmount) return

    setError(undefined)
    setIsSubmitting(true)

    api(
      'bet',
      removeUndefinedProps({
        amount: betAmount,
        answerId,
        contractId: contract.id,
      })
    )
      .then((r) => {
        console.log('placed bet. Result:', r)
        setIsSubmitting(false)
        setBetAmount(undefined)
        props.closePanel()
      })
      .catch((e) => {
        if (e instanceof APIError) {
          setError(e.message.toString())
        } else {
          console.error(e)
          setError('Error placing bet')
        }
        setIsSubmitting(false)
      })

    track('bet', {
      location: 'answer panel',
      outcomeType: contract.outcomeType,
      slug: contract.slug,
      contractId: contract.id,
      amount: betAmount,
      answerId,
    })
  }

  const betDisabled = isSubmitting || !betAmount || error

  const initialProb = getAnswerProbability(contract, answer.id)

  const { resultProb, shares, maxPayout } = getSimulatedBetInfo(
    betAmount ?? 0,
    answerId,
    contract
  )

  const maxReturn = betAmount ? (maxPayout - betAmount) / betAmount : 0
  const maxReturnPercent = formatPercent(maxReturn)

  const bankrollFraction = (betAmount ?? 0) / (user?.balance ?? 1e9)

  const warning =
    (betAmount ?? 0) >= 100 && bankrollFraction >= 0.5 && bankrollFraction <= 1
      ? `You might not want to spend ${formatPercent(
          bankrollFraction
        )} of your balance on a single bet. \n\nCurrent balance: ${formatMoney(
          user?.balance ?? 0
        )}`
      : undefined

  return (
    <Col className={clsx(className)}>
      <Row className="items-center justify-between self-stretch">
        <div className="text-xl">Bet on "{answer.text}"</div>
        <button className="hover:bg-ink-200 rounded-full" onClick={closePanel}>
          <XIcon className="text-ink-500 mx-auto h-8 w-8" aria-hidden />
        </button>
      </Row>
      <Row className="text-ink-500 my-3 justify-between text-left text-sm">
        Amount
      </Row>

      <BuyAmountInput
        amount={betAmount}
        onChange={setBetAmount}
        error={error}
        setError={setError}
        disabled={isSubmitting}
        showBalance
      />

      <Col className="mt-8 w-full gap-3">
        <Row className="items-center justify-between text-sm">
          <div className="text-ink-500">Probability</div>
          <Row>
            <div>{formatPercent(initialProb)}</div>
            <div className="mx-2">→</div>
            <div>{formatPercent(resultProb)}</div>
          </Row>
        </Row>

        <Row className="items-center justify-between gap-2 text-sm">
          <Row className="text-ink-500 flex-nowrap items-center gap-2 whitespace-nowrap">
            {contract.mechanism === 'dpm-2' && shares !== undefined ? (
              <>
                <div>
                  Estimated <br /> payout if chosen
                </div>
                <InfoTooltip
                  text={`Current payout for ${formatWithCommas(
                    shares
                  )} / ${formatWithCommas(
                    shares + contract.totalShares[answerId]
                  )} shares`}
                />
              </>
            ) : (
              <div>Max payout</div>
            )}
          </Row>
          <Row className="flex-wrap items-end justify-end gap-2">
            <span className="whitespace-nowrap">{formatMoney(maxPayout)}</span>
            <span>(+{maxReturnPercent})</span>
          </Row>
        </Row>
      </Col>

      <Spacer h={6} />
      {user ? (
        <WarningConfirmationButton
          size="xl"
          marketType="freeResponse"
          amount={betAmount}
          warning={warning}
          onSubmit={submitBet}
          isSubmitting={isSubmitting}
          disabled={!!betDisabled}
          color={'indigo'}
          actionLabel="Buy"
          userOptedOutOfWarning={user.optOutBetWarnings}
          inModal={true}
        />
      ) : (
        <BetSignUpPrompt />
      )}
    </Col>
  )
}

const getSimulatedBetInfo = (
  betAmount: number,
  answerId: string,
  contract: MultiContract
) => {
  const resultProb = getOutcomeProbabilityAfterBet(
    contract,
    answerId,
    betAmount
  )

  const shares = calculateSharesBought(contract, answerId, betAmount)

  const maxPayout = betAmount
    ? contract.mechanism === 'dpm-2'
      ? calculateDpmPayoutAfterCorrectBet(contract, {
          outcome: answerId,
          amount: betAmount,
          shares,
        } as Bet)
      : shares
    : 0

  return { resultProb, maxPayout, shares }
}

export function AnswerCpmmBetPanel(props: {
  answer: Answer
  contract: CPMMMultiContract
  closePanel: () => void
  outcome: 'YES' | 'NO' | 'LIMIT' | undefined
  me: User | null | undefined
}) {
  const { answer, contract, closePanel, outcome, me } = props
  return (
    <Col className="gap-2">
      <Row className="justify-between">
        <Subtitle className="!mt-0">{answer.text}</Subtitle>
        <div className="text-xl">{formatPercent(answer.prob)}</div>
      </Row>
      <BuyPanel
        contract={contract}
        multiProps={{
          answers: contract.answers,
          answerToBuy: answer as Answer,
        }}
        user={me}
        initialOutcome={outcome}
        // singularView={outcome}
        onBuySuccess={() => setTimeout(closePanel, 500)}
        location={'contract page answer'}
        inModal={true}
      />
    </Col>
  )
}
