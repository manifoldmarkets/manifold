import { CPMMNumericContract } from 'common/contract'
import { Row } from 'web/components/layout/row'
import { Col } from 'web/components/layout/col'
import { Answer } from 'common/answer'
import { Button, ColorType, SizeType } from 'web/components/buttons/button'
import { useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { useUserContractBets } from 'web/hooks/use-user-bets'
import { groupBy, max, min, sumBy } from 'lodash'
import { floatingEqual } from 'common/util/math'
import { Modal, MODAL_CLASS } from 'web/components/layout/modal'
import clsx from 'clsx'
import { track } from 'web/lib/service/analytics'
import { formatPercent, shortFormatNumber } from 'common/util/format'
import { MultiSeller } from 'web/components/answers/answer-components'
import { AnswerCpmmBetPanel } from 'web/components/answers/answer-bet-panel'
import { Slider } from 'web/components/widgets/slider'
import { mean } from 'd3-array'
import { api } from 'web/lib/firebase/api'
import { removeUndefinedProps } from 'common/util/object'
import { filterDefined } from 'common/util/array'

export const NumericBetPanel = (props: { contract: CPMMNumericContract }) => {
  const { contract } = props
  const { answers } = contract
  const buckets = answers.map((a) => parseFloat(a.text))
  const [amount, setAmount] = useState(mean(buckets) ?? 0)
  const minimum = min(buckets) ?? 0
  const maximum = max(buckets) ?? 0
  const [mode, setMode] = useState<'less than' | 'more than' | 'limit'>(
    'less than'
  )
  const placeBet = async () => {
    await api(
      'multi-bet',
      removeUndefinedProps({
        outcome: 'YES',
        amount: 20,
        contractId: contract.id,
        answerIds: filterDefined([
          ...answers
            .filter((a) =>
              mode === 'less than'
                ? parseFloat(a.text) < amount
                : parseFloat(a.text) > amount
            )
            .map((a) => a.id),
        ]),
      })
    )
  }
  const onChange = (newAmount: number) => {
    console.log('newAmount', newAmount)
    if (newAmount < minimum) {
      setAmount(minimum)
    }
    if (newAmount > maximum) {
      setAmount(maximum)
    }
    setAmount(newAmount)
  }
  return (
    <Col className={'gap-2'}>
      <Row className={'justify-around gap-1'}>
        {answers.map((a) => (
          <Col key={a.id}>
            <BetButton
              color={
                mode === 'less than'
                  ? parseFloat(a.text) < amount
                    ? 'blue'
                    : 'gray-outline'
                  : parseFloat(a.text) > amount
                  ? 'blue'
                  : 'gray-outline'
              }
              answer={a}
              outcome={'YES'}
              contract={contract}
            />
          </Col>
        ))}
      </Row>
      <Slider
        className={'w-full'}
        step={1}
        amount={amount}
        onChange={onChange}
        min={minimum}
        max={maximum}
      />
      <Row className={'items-center justify-center gap-2'}>
        <Button
          color={mode === 'less than' ? 'blue' : 'gray-outline'}
          onClick={() => setMode('less than')}
        >
          Less than
        </Button>
        <span className={'mx-2 text-xl'}>{shortFormatNumber(amount)}</span>
        <Button
          color={mode === 'more than' ? 'blue' : 'gray-outline'}
          onClick={() => setMode('more than')}
        >
          More than
        </Button>
      </Row>
      <Row className={'justify-center'}>
        <Button onClick={placeBet}>Place Bet</Button>
      </Row>
    </Col>
  )
}
const BetButton = (props: {
  answer: Answer
  outcome: 'YES' | 'NO' | 'LIMIT' | undefined
  contract: CPMMNumericContract
  color?: ColorType
  size?: SizeType
}) => {
  const { answer, size, contract, color } = props
  const [outcome, setOutcome] = useState<'YES' | 'NO' | 'LIMIT' | undefined>(
    undefined
  )

  const user = useUser()
  // This accommodates for bets on the non-main answer, perhaps made through the api
  const userBets = useUserContractBets(user?.id, contract.id)
  const userBetsByAnswer = groupBy(userBets, (bet) => bet.answerId)
  const sharesSum = sumBy(userBetsByAnswer[answer.id], (bet) =>
    bet.outcome === 'YES' ? bet.shares : -bet.shares
  )
  const showSell = !floatingEqual(sharesSum, 0)
  return (
    <Col className={'h-full items-end justify-end'}>
      <Modal
        open={outcome != undefined}
        setOpen={(open) => setOutcome(open ? props.outcome : undefined)}
        className={MODAL_CLASS}
      >
        <AnswerCpmmBetPanel
          answer={answer}
          contract={contract}
          outcome={outcome}
          closePanel={() => setOutcome(undefined)}
          me={user}
        />
      </Modal>
      {showSell && user && (
        <Row className={'justify-end px-2'}>
          <MultiSeller
            answer={answer}
            contract={contract}
            userBets={userBetsByAnswer[answer.id]}
            user={user}
          />
        </Row>
      )}
      <Button
        size={size ?? 'sm'}
        color={color}
        className={clsx('')}
        onClick={(e) => {
          e.stopPropagation()
          track('bet intent', { location: 'answer panel' })
          setOutcome(props.outcome)
        }}
      >
        <Col
          style={{
            height: `${answer.prob * 700}px`,
          }}
          className={'min-h-[3rem] w-full items-center justify-between '}
        >
          <span className={'text-xl'}>{formatPercent(answer.prob)}</span>

          <span
            className={clsx(
              size === 'xs' ? 'line-clamp-1' : 'line-clamp-2',
              'text-left'
            )}
          >
            {answer.text}
          </span>
        </Col>
      </Button>
    </Col>
  )
}
