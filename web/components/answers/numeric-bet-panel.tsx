import { CPMMNumericContract } from 'common/contract'
import { Row } from 'web/components/layout/row'
import { Col } from 'web/components/layout/col'
import { Answer } from 'common/answer'
import { Button, ColorType, SizeType } from 'web/components/buttons/button'
import { useEffect, useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { useUserContractBets } from 'web/hooks/use-user-bets'
import { groupBy, max, min, orderBy, sumBy } from 'lodash'
import { floatingEqual } from 'common/util/math'
import { Modal, MODAL_CLASS } from 'web/components/layout/modal'
import clsx from 'clsx'
import { track } from 'web/lib/service/analytics'
import { formatLargeNumber, formatPercent } from 'common/util/format'
import { MultiSeller } from 'web/components/answers/answer-components'
import { AnswerCpmmBetPanel } from 'web/components/answers/answer-bet-panel'
import { RangeSlider, Slider } from 'web/components/widgets/slider'
import { api } from 'web/lib/firebase/api'
import { removeUndefinedProps } from 'common/util/object'
import { filterDefined } from 'common/util/array'
import { BuyAmountInput } from 'web/components/widgets/amount-input'
import { useFocus } from 'web/hooks/use-focus'
import { useIsAdvancedTrader } from 'web/hooks/use-is-advanced-trader'
import { getExpectedValue } from 'common/calculate'
import { toast } from 'react-hot-toast'
import { isAndroid, isIOS } from 'web/lib/util/device'
import {
  getMultiNumericAnswerBucketRanges,
  getNumericBucketWidth,
} from 'common/multi-numeric'

export const NumericBetPanel = (props: { contract: CPMMNumericContract }) => {
  const { contract } = props
  const { answers, min: minimum, max: maximum } = contract
  const buckets = orderBy(
    answers.map((a) => parseFloat(a.text)),
    (a) => a,
    'asc'
  )
  const [amount, setAmount] = useState(getExpectedValue(contract))
  const [betAmount, setBetAmount] = useState<number | undefined>(10)
  const [range, setRange] = useState<[number, number]>([minimum, maximum])
  const [mode, setMode] = useState<
    'less than' | 'more than' | 'about right' | undefined
  >(undefined)
  const [showDistribution, setShowDistribution] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [inputRef, focusAmountInput] = useFocus()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isAdvancedTrader = useIsAdvancedTrader()
  const niceAmount = formatLargeNumber(amount)
  const aboutRightBuckets = (amountGiven: number) => {
    // get the two buckets on either side of the amount
    const bucketsOrderedByDistance = orderBy(
      buckets,
      (a) => Math.abs(a - amountGiven),
      'asc'
    )
    const bucketsToBid = orderBy(
      bucketsOrderedByDistance.slice(0, 4),
      (a) => a,
      'asc'
    )
    const bucketWidth = getNumericBucketWidth(contract) / 2
    return [
      (min(bucketsToBid) ?? minimum) - bucketWidth,
      (max(bucketsToBid) ?? maximum) + bucketWidth,
    ] as [number, number]
  }
  const placeBet = async () => {
    if (!betAmount) {
      setError('Please enter a bet amount')
      return
    }
    setIsSubmitting(true)
    setError(undefined)
    await toast.promise(
      api(
        'multi-bet',
        removeUndefinedProps({
          outcome: 'YES',
          amount: betAmount ?? 0,
          contractId: contract.id,
          answerIds: filterDefined([
            ...answers
              .filter((a) =>
                mode === 'less than'
                  ? parseFloat(a.text) <= amount
                  : mode === 'more than'
                  ? parseFloat(a.text) >= amount
                  : mode === 'about right'
                  ? parseFloat(a.text) >= range[0] &&
                    parseFloat(a.text) <= range[1]
                  : false
              )
              .map((a) => a.id),
          ]),
        })
      ),
      {
        loading: 'Placing bet...',
        success: 'Bet placed!',
        error: (e) => e.message,
      }
    )
    setIsSubmitting(false)
  }
  const onChange = (newAmount: number) => {
    const realAmount =
      mode === 'more than' ? maximum - newAmount + minimum : newAmount
    if (realAmount < minimum) {
      setAmount(minimum)
    } else if (realAmount > maximum) {
      setAmount(maximum)
    } else {
      setAmount(realAmount)
    }
  }
  useEffect(() => {
    setAmount(getExpectedValue(contract))
    if (mode === 'about right') {
      setRange(aboutRightBuckets(amount))
    }
    if (!isIOS() && !isAndroid()) {
      focusAmountInput()
    }
  }, [mode])

  return (
    <Col className={'gap-2'}>
      {showDistribution && (
        <Col className={'gap-2'}>
          <Row className={'justify-end'}>
            <Button
              color={'gray-white'}
              size={'2xs'}
              onClick={() => setShowDistribution(false)}
            >
              Hide distribution
            </Button>
          </Row>
          <Row className={'justify-around gap-1'}>
            {answers.map((a) => (
              <Col key={a.id}>
                <BetButton
                  color={
                    mode === 'less than'
                      ? parseFloat(a.text) <= amount
                        ? 'red'
                        : 'gray-outline'
                      : mode === 'more than'
                      ? parseFloat(a.text) >= amount
                        ? 'green'
                        : 'gray-outline'
                      : mode === 'about right'
                      ? parseFloat(a.text) >= range[0] &&
                        parseFloat(a.text) <= range[1]
                        ? 'blue'
                        : 'gray-outline'
                      : 'gray-outline'
                  }
                  answer={a}
                  size={'xs'}
                  outcome={'YES'}
                  contract={contract}
                />
              </Col>
            ))}
          </Row>
          {mode === 'less than' || mode === 'more than' ? (
            <Slider
              color={
                mode === 'less than'
                  ? 'red'
                  : mode === 'more than'
                  ? 'green'
                  : 'indigo'
              }
              className={'w-full'}
              step={Math.abs(buckets[0] - buckets[1])}
              amount={
                mode === 'more than' ? maximum - amount + minimum : amount
              }
              onChange={onChange}
              min={minimum}
              max={maximum}
              inverted={mode === 'more than'}
            />
          ) : (
            mode === 'about right' && (
              <RangeSlider
                color={'indigo'}
                className={'w-full'}
                highValue={range[1]}
                lowValue={range[0]}
                setValues={(low, high) => setRange([low, high])}
                min={minimum}
                max={maximum}
              />
            )
          )}
        </Col>
      )}
      {mode === undefined ? (
        <Row className={'items-center justify-center gap-2'}>
          <Button
            color={'red'}
            size={'xl'}
            onClick={() => setMode('less than')}
            className={'grow'}
          >
            Lower
          </Button>
          <Button
            color={'blue'}
            size={'xl'}
            className={'grow'}
            onClick={() => setMode('about right')}
          >
            About right
          </Button>
          <Button
            color={'green'}
            size={'xl'}
            className={'grow'}
            onClick={() => setMode('more than')}
          >
            Higher
          </Button>
        </Row>
      ) : (
        <Col
          className={clsx(
            'gap-2 rounded-md p-2',
            mode === 'less than'
              ? 'bg-red-50'
              : mode === 'more than'
              ? 'bg-green-50'
              : 'bg-blue-50'
          )}
        >
          <Row className={'justify-between'}>
            <span className={'text-2xl'}>
              {mode === 'less than'
                ? 'Lower than ' + niceAmount
                : mode === 'more than'
                ? 'Higher than ' + niceAmount
                : 'Between'}{' '}
              {mode === 'about right' && (
                <span>
                  {range[0]} and {range[1]}
                </span>
              )}
            </span>
            <Button
              color={'gray-white'}
              size={'2xs'}
              onClick={() => {
                setShowDistribution(!showDistribution)
              }}
            >
              {showDistribution ? 'Hide ' : 'Show '} distribution
            </Button>
          </Row>
          <Row>
            <BuyAmountInput
              amount={betAmount}
              onChange={setBetAmount}
              error={error}
              setError={setError}
              disabled={isSubmitting}
              inputRef={inputRef}
              showSlider={isAdvancedTrader}
            />
          </Row>
          <Row className={'justify-between'}>
            <Button
              color={'gray'}
              onClick={() => setMode(undefined)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>

            <Button
              loading={isSubmitting}
              onClick={placeBet}
              disabled={isSubmitting}
            >
              Submit
            </Button>
          </Row>
        </Col>
      )}
    </Col>
  )
}
const BetButton = (props: {
  answer: Answer
  outcome: 'YES' | 'NO' | undefined
  contract: CPMMNumericContract
  color?: ColorType
  size?: SizeType
}) => {
  const { answer, size, contract, color } = props
  const [outcome, setOutcome] = useState<'YES' | 'NO' | undefined>(undefined)

  const user = useUser()
  // This accommodates for bets on the non-main answer, perhaps made through the api
  const userBets = useUserContractBets(user?.id, contract.id)
  const userBetsByAnswer = groupBy(userBets, (bet) => bet.answerId)
  const sharesSum = sumBy(userBetsByAnswer[answer.id], (bet) =>
    bet.outcome === 'YES' ? bet.shares : -bet.shares
  )
  const showSell = !floatingEqual(sharesSum, 0)
  const ranges = getMultiNumericAnswerBucketRanges(contract)
  const answerRange = ranges[answer.index]
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
        <Row className={'text-ink-500 mb-1 w-full justify-center text-sm'}>
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
            height: `${answer.prob * 200}px`,
          }}
          className={
            'min-h-[2.6rem] w-full min-w-[2rem] items-center justify-between '
          }
        >
          <span className={'text-base'}>{formatPercent(answer.prob)}</span>

          <span
            className={clsx(
              size === 'xs' ? 'line-clamp-1' : 'line-clamp-2',
              'text-left font-bold'
            )}
          >
            {answerRange[0]} - {answerRange[1]}
          </span>
        </Col>
      </Button>
    </Col>
  )
}
