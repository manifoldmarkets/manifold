import clsx from 'clsx'
import { MAX_ANSWER_LENGTH, getMaximumAnswers } from 'common/answer'
import { Bet } from 'common/bet'
import {
  calculateDpmPayoutAfterCorrectBet,
  calculateDpmShares,
  getDpmOutcomeProbabilityAfterBet,
} from 'common/calculate-dpm'
import {
  CPMMMultiContract,
  FreeResponseContract,
  MultiContract,
  add_answers_mode,
  tradingAllowed,
} from 'common/contract'
import { ANSWER_COST } from 'common/economy'
import {
  formatMoney,
  formatPercent,
  formatWithCommas,
} from 'common/util/format'
import { useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { BuyAmountInput } from 'web/components/widgets/amount-input'
import { ExpandingInput } from 'web/components/widgets/expanding-input'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { Input } from 'web/components/widgets/input'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { APIError, api, createAnswer } from 'web/lib/firebase/api'
import { withTracking } from 'web/lib/service/analytics'

export function CreateAnswerCpmmPanel(props: {
  contract: CPMMMultiContract
  text: string
  setText: (text: string) => void
  children?: React.ReactNode
}) {
  const { contract, text, setText, children } = props

  const [isSubmitting, setIsSubmitting] = useState(false)

  const canSubmit = text && !isSubmitting

  const submitAnswer = async () => {
    if (canSubmit) {
      setIsSubmitting(true)

      try {
        await api('market/:contractId/answer', {
          contractId: contract.id,
          text,
        })
        setText('')
      } catch (e) {}

      setIsSubmitting(false)
    }
  }

  return (
    <Col className="gap-1">
      <ExpandingInput
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-full"
        placeholder="Search or add answer"
        rows={1}
        maxLength={MAX_ANSWER_LENGTH}
      />

      <Row className="justify-between">
        {children}

        {text && (
          <Row className="gap-1">
            <Button size="2xs" color="gray" onClick={() => setText('')}>
              Clear
            </Button>
            <Button
              size="2xs"
              loading={isSubmitting}
              disabled={!canSubmit}
              onClick={withTracking(submitAnswer, 'submit answer')}
            >
              Add answer ({formatMoney(ANSWER_COST)})
            </Button>
          </Row>
        )}
      </Row>
    </Col>
  )
}

function CreateAnswerDpmPanel(props: {
  contract: FreeResponseContract
  text: string
  setText: (text: string) => void
}) {
  const { contract, text, setText } = props
  const user = useUser()
  const [betAmount, setBetAmount] = useState<number | undefined>(10)
  const [amountError, setAmountError] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const canSubmit = text && betAmount && !amountError && !isSubmitting

  const submitAnswer = async () => {
    if (canSubmit) {
      setIsSubmitting(true)

      try {
        await createAnswer({
          contractId: contract.id,
          text,
          amount: betAmount,
        })
        setText('')
        setBetAmount(10)
        setAmountError(undefined)
      } catch (e) {
        if (e instanceof APIError) {
          setAmountError(e.toString())
        }
      }

      setIsSubmitting(false)
    }
  }

  const resultProb = getDpmOutcomeProbabilityAfterBet(
    contract.totalShares,
    'new',
    betAmount ?? 0
  )

  const shares = calculateDpmShares(contract.totalShares, betAmount ?? 0, 'new')

  const currentPayout = betAmount
    ? calculateDpmPayoutAfterCorrectBet(contract, {
        outcome: 'new',
        amount: betAmount,
        shares,
      } as Bet)
    : 0

  const currentReturn = betAmount ? (currentPayout - betAmount) / betAmount : 0
  const currentReturnPercent = (currentReturn * 100).toFixed() + '%'

  if (user?.isBannedFromPosting) return <></>

  return (
    <Col className="mb-2 gap-2">
      <ExpandingInput
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-full"
        placeholder="Search or add answer"
        rows={1}
        maxLength={MAX_ANSWER_LENGTH}
      />
      {text && (
        <Col className="bg-canvas-50 rounded p-2">
          <Row className={clsx('flex-wrap gap-4')}>
            <Col className="w-full gap-2">
              <Row className="text-ink-500 mb-3 justify-between text-left text-sm">
                Bet Amount
                <span className={'sm:hidden'}>
                  Balance: {formatMoney(user?.balance ?? 0)}
                </span>
              </Row>{' '}
              <BuyAmountInput
                amount={betAmount}
                onChange={setBetAmount}
                error={amountError}
                setError={setAmountError}
                minimumAmount={1}
                disabled={isSubmitting}
              />
            </Col>
            <Col className="w-full gap-3">
              <Row className="items-center justify-between text-sm">
                <div className="text-ink-500">Probability</div>
                <Row>
                  <div>{formatPercent(0)}</div>
                  <div className="mx-2">→</div>
                  <div>{formatPercent(resultProb)}</div>
                </Row>
              </Row>

              <Row className="items-center justify-between gap-4 text-sm">
                <Row className="text-ink-500 flex-nowrap items-center gap-2 whitespace-nowrap">
                  <div>
                    Estimated <br /> payout if chosen
                  </div>
                  <InfoTooltip
                    text={`Current payout for ${formatWithCommas(
                      shares
                    )} / ${formatWithCommas(shares)} shares`}
                  />
                </Row>
                <Row className="flex-wrap items-end justify-end gap-2">
                  <span className="whitespace-nowrap">
                    {formatMoney(currentPayout)}
                  </span>
                  <span>(+{currentReturnPercent})</span>
                </Row>
              </Row>
            </Col>
          </Row>
          <Button
            color="green"
            className="self-end"
            loading={isSubmitting}
            disabled={!canSubmit}
            onClick={withTracking(submitAnswer, 'submit answer')}
          >
            Add answer
          </Button>
        </Col>
      )}
    </Col>
  )
}

export function SearchCreateAnswerPanel(props: {
  contract: MultiContract
  addAnswersMode: add_answers_mode | undefined
  text: string
  setText: (text: string) => void
  children?: React.ReactNode
}) {
  const { contract, addAnswersMode, text, setText, children } = props

  const user = useUser()
  const privateUser = usePrivateUser()
  const unresolvedAnswers = contract.answers.filter((a) =>
    'resolution' in a ? !a.resolution : true
  )
  const shouldAnswersSumToOne =
    contract.mechanism === 'cpmm-multi-1'
      ? contract.shouldAnswersSumToOne
      : true

  if (
    user &&
    !user.isBannedFromPosting &&
    (addAnswersMode === 'ANYONE' ||
      (addAnswersMode === 'ONLY_CREATOR' && user.id === contract.creatorId)) &&
    tradingAllowed(contract) &&
    !privateUser?.blockedByUserIds.includes(contract.creatorId) &&
    unresolvedAnswers.length < getMaximumAnswers(shouldAnswersSumToOne)
  ) {
    return contract.mechanism === 'cpmm-multi-1' ? (
      <CreateAnswerCpmmPanel contract={contract} text={text} setText={setText}>
        {children}
      </CreateAnswerCpmmPanel>
    ) : (
      <>
        <CreateAnswerDpmPanel
          contract={contract as FreeResponseContract}
          text={text}
          setText={setText}
        />
        {children}
      </>
    )
  }

  return (
    <>
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="!text-md"
        placeholder="Search answers"
      />
      {children}
    </>
  )
}
