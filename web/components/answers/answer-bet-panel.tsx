import clsx from 'clsx'
import React, { useState } from 'react'
import { XIcon } from '@heroicons/react/solid'

import { Answer, DpmAnswer } from 'common/answer'
import { CPMMMultiContract, MultiContract } from 'common/contract'
import { BuyAmountInput } from '../widgets/amount-input'
import { Col } from '../layout/col'
import { APIError, placeBet } from 'web/lib/firebase/api'
import { Row } from '../layout/row'
import { Spacer } from '../layout/spacer'
import {
  formatMoney,
  formatPercent,
  formatWithCommas,
} from 'common/util/format'
import { InfoTooltip } from '../widgets/info-tooltip'
import { useUser } from 'web/hooks/use-user'
import { calculateDpmPayoutAfterCorrectBet } from 'common/calculate-dpm'
import { Bet } from 'common/bet'
import { track } from 'web/lib/service/analytics'
import { BetSignUpPrompt } from '../sign-up-prompt'
import { WarningConfirmationButton } from '../buttons/warning-confirmation-button'
import {
  calculateSharesBought,
  getAnswerProbability,
  getOutcomeProbabilityAfterBet,
} from 'common/calculate'
import { removeUndefinedProps } from 'common/util/object'
import { Subtitle } from '../widgets/subtitle'
import { BuyPanel } from '../bet/bet-panel'
import { User } from 'common/user'

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

    placeBet(
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
          setError(e.toString())
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
        inputClassName="w-full max-w-none"
        amount={betAmount}
        onChange={setBetAmount}
        error={error}
        setError={setError}
        disabled={isSubmitting}
        sliderOptions={{ show: true, wrap: false }}
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
      />
    </Col>
  )
}
