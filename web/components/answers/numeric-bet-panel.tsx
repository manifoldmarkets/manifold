import { CPMMMultiContract, CPMMNumericContract } from 'common/contract'
import { Row } from 'web/components/layout/row'
import { Col } from 'web/components/layout/col'
import { Answer } from 'common/answer'
import {
  Button,
  ColorType,
  IconButton,
  SizeType,
} from 'web/components/buttons/button'
import { useEffect, useMemo, useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { useUserContractBets } from 'web/hooks/use-user-bets'
import { find, first, groupBy, sumBy } from 'lodash'
import { floatingEqual } from 'common/util/math'
import { Modal, MODAL_CLASS } from 'web/components/layout/modal'
import clsx from 'clsx'
import { track } from 'web/lib/service/analytics'
import { formatMoney, formatPercent } from 'common/util/format'
import { MultiSeller } from 'web/components/answers/answer-components'
import { AnswerCpmmBetPanel } from 'web/components/answers/answer-bet-panel'
import { RangeSlider, Slider } from 'web/components/widgets/slider'
import { api } from 'web/lib/firebase/api'
import { removeUndefinedProps } from 'common/util/object'
import { filterDefined } from 'common/util/array'
import { BuyAmountInput } from 'web/components/widgets/amount-input'
import { useFocus } from 'web/hooks/use-focus'
import { useIsAdvancedTrader } from 'web/hooks/use-is-advanced-trader'
import { toast } from 'react-hot-toast'
import { isAndroid, isIOS } from 'web/lib/util/device'
import {
  getRangeContainingValue,
  formatExpectedValue,
  getExpectedValue,
  getMultiNumericAnswerToRange,
  getNumericBucketSize,
} from 'common/multi-numeric'
import { XIcon } from '@heroicons/react/solid'
import { Bet } from 'common/bet'
import { User } from 'common/user'
import { SellSharesModal } from 'web/components/bet/sell-row'
import { calculateCpmmMultiArbitrageYesBets } from 'common/calculate-cpmm-arbitrage'
import { useUnfilledBetsAndBalanceByUserId } from 'web/hooks/use-bets'
import { QuickBetAmountsRow } from 'web/components/bet/bet-panel'
import { getContractBetMetrics } from 'common/calculate'

export const NumericBetPanel = (props: { contract: CPMMNumericContract }) => {
  const { contract } = props
  const { answers, min: minimum, max: maximum } = contract
  const [expectedValue, setExpectedValue] = useState(getExpectedValue(contract))
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
  const user = useUser()
  const userBets = useUserContractBets(user?.id, contract.id)
  const userBetsByAnswer = groupBy(userBets, (bet) => bet.answerId)
  const step = getNumericBucketSize(contract.min, contract.max, answers.length)
  const { unfilledBets, balanceByUserId } = useUnfilledBetsAndBalanceByUserId(
    contract.id
  )

  const shouldIncludeAnswer = (a: Answer) => {
    const answerRange = getMultiNumericAnswerToRange(a.text)
    return mode === 'less than'
      ? answerRange[0] < expectedValue
      : mode === 'more than'
      ? answerRange[0] >= expectedValue || answerRange[1] > expectedValue
      : mode === 'about right'
      ? answerRange[0] >= range[0] && answerRange[1] <= range[1]
      : false
  }
  const answersToBuy = answers.filter((a) => shouldIncludeAnswer(a))
  const placeBet = async () => {
    if (!betAmount) {
      setError('Please enter a bet amount')
      return
    }
    setIsSubmitting(true)
    setError(undefined)
    toast
      .promise(
        api(
          'multi-bet',
          removeUndefinedProps({
            amount: betAmount ?? 0,
            contractId: contract.id,
            answerIds: filterDefined(answersToBuy.map((a) => a.id)),
          })
        ),
        {
          loading: 'Placing bet...',
          success: 'Bet placed!',
          error: (e) => e.message,
        }
      )
      .finally(() => setIsSubmitting(false))
  }
  const roundToEpsilon = (num: number) => Number(num.toFixed(2))

  const onChangeLimit = (newAmount: number) => {
    const realAmount = roundToEpsilon(
      mode === 'more than' ? maximum - newAmount + minimum : newAmount
    )
    if (realAmount < minimum) {
      setExpectedValue(minimum)
    } else if (realAmount > maximum) {
      setExpectedValue(maximum)
    } else {
      setExpectedValue(realAmount)
    }
  }

  const onChangeRange = (low: number, high: number) => {
    setRange([
      roundToEpsilon(low),
      roundToEpsilon(
        high !== range[1] ? (high === maximum ? maximum : high) : range[1]
      ),
    ])
  }
  useEffect(() => {
    const newExpectedValue = getExpectedValue(contract)
    setExpectedValue(newExpectedValue)
    if (mode === 'about right') {
      setRange(
        getRangeContainingValue(
          newExpectedValue,
          answers.map((a) => a.text),
          minimum,
          maximum
        )
      )
    }
    if (!isIOS() && !isAndroid()) {
      focusAmountInput()
    }
  }, [mode])
  useEffect(() => {}, [showDistribution])

  const { potentialPayout, currentReturnPercent, newExpectedValue } =
    useMemo(() => {
      if (!betAmount || !answersToBuy)
        return {
          potentialPayout: 0,
          currentReturnPercent: '0%',
          newExpectedValue: expectedValue,
        }
      const { newBetResults, updatedAnswers } =
        calculateCpmmMultiArbitrageYesBets(
          answers,
          answersToBuy,
          betAmount,
          undefined,
          unfilledBets,
          balanceByUserId
        )
      const potentialPayout = sumBy(
        first(newBetResults)?.takers ?? [],
        (taker) => taker.shares
      )
      const currentReturn = betAmount
        ? (potentialPayout - betAmount) / betAmount
        : 0
      const currentReturnPercent = formatPercent(currentReturn)
      const newExpectedValue = getExpectedValue({
        ...contract,
        answers: answers.map((a) => {
          const newAnswer = find(updatedAnswers, (newAnswer) => {
            return newAnswer.id === a.id
          })
          return newAnswer ? newAnswer : a
        }),
      })
      return { potentialPayout, currentReturnPercent, newExpectedValue }
    }, [betAmount, answers, unfilledBets, balanceByUserId])

  const formattedAmount = formatExpectedValue(expectedValue, contract)
  const betLabel =
    mode === 'less than'
      ? 'Lower than ' + formattedAmount
      : mode === 'more than'
      ? formattedAmount + ' or higher'
      : `${range[0]} - ${range[1]}`
  const modeColor =
    mode === 'less than'
      ? 'red'
      : mode === 'more than'
      ? 'green'
      : mode === 'about right'
      ? 'blue'
      : 'gray-outline'
  const gridClasses: { [key: number]: string } = {
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
    5: 'grid-cols-5',
    6: 'grid-cols-3 sm:grid-cols-6',
    7: 'grid-cols-4 md:grid-cols-7',
    8: 'grid-cols-4 lg:grid-cols-8',
    9: 'grid-cols-5 lg:grid-cols-9',
    10: 'grid-cols-5 lg:grid-cols-10',
  }
  const itemCount = contract.answers.length
  return (
    <Col className={'gap-2'}>
      {showDistribution && (
        <Col className={'gap-2'}>
          <div
            className={`grid gap-y-3 ${gridClasses[Math.min(itemCount, 10)]}`}
          >
            {answers.map((a) => (
              <Col
                key={a.id}
                className={'col-span-1 items-center justify-center'}
              >
                <BetButton
                  betsOnAnswer={userBetsByAnswer[a.id] ?? []}
                  color={shouldIncludeAnswer(a) ? modeColor : 'gray-outline'}
                  answer={a}
                  size={'xs'}
                  outcome={'YES'}
                  contract={contract}
                />
              </Col>
            ))}
          </div>
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
              step={step}
              amount={
                mode === 'more than'
                  ? maximum - expectedValue + minimum
                  : expectedValue
              }
              onChange={onChangeLimit}
              min={
                mode === 'more than'
                  ? minimum + step
                  : mode === 'less than'
                  ? minimum + step
                  : minimum
              }
              max={maximum}
              inverted={mode === 'more than'}
            />
          ) : (
            mode === 'about right' && (
              <RangeSlider
                color={'indigo'}
                step={step}
                className={'w-full'}
                highValue={range[1]}
                lowValue={range[0]}
                setValues={onChangeRange}
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
            'gap-4 rounded-md px-3 py-2',
            mode === 'less than'
              ? 'bg-scarlet-50'
              : mode === 'more than'
              ? 'bg-teal-50'
              : 'bg-blue-50 dark:bg-blue-900/30'
          )}
        >
          <Row className={'justify-between'}>
            <span className={'ml-1 text-xl'}>{betLabel}</span>
            <Row className={'items-center'}>
              <Button
                color={'gray-white'}
                size={'2xs'}
                onClick={() => {
                  setShowDistribution(!showDistribution)
                }}
                className={'whitespace-nowrap'}
              >
                {showDistribution ? 'Hide ' : 'Show '} distribution
              </Button>
              <IconButton
                className={'w-12'}
                onClick={() => {
                  setMode(undefined)
                  setShowDistribution(false)
                }}
                disabled={isSubmitting}
              >
                <XIcon className={'h-4 w-4'} />
              </IconButton>
            </Row>
          </Row>
          <QuickBetAmountsRow
            onAmountChange={setBetAmount}
            betAmount={betAmount}
          />
          <Row className={' flex-wrap gap-2'}>
            <BuyAmountInput
              parentClassName={isAdvancedTrader ? '' : '!w-56'}
              amount={betAmount}
              onChange={setBetAmount}
              error={error}
              setError={setError}
              disabled={isSubmitting}
              inputRef={inputRef}
              showSlider={isAdvancedTrader}
            />
            <Col className={'mt-0.5'}>
              <Row className={'gap-1'}>
                <span className={'text-ink-700'}>Max payout:</span>
                {formatMoney(potentialPayout)}
                <span className=" text-green-500">
                  {'+' + currentReturnPercent}
                </span>
              </Row>
              <Row className={'gap-1'}>
                <span className={'text-ink-700'}>New value:</span>
                {formatExpectedValue(newExpectedValue, contract)}
              </Row>
            </Col>
          </Row>
          <Row>
            <Button
              size={'xl'}
              color={modeColor}
              className={'w-full'}
              loading={isSubmitting}
              onClick={placeBet}
              disabled={isSubmitting}
            >
              Bet {betLabel}
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
  betsOnAnswer: Bet[]
  color?: ColorType
  size?: SizeType
}) => {
  const { answer, size, betsOnAnswer, contract, color } = props
  const [outcome, setOutcome] = useState<'YES' | 'NO' | undefined>(undefined)

  const user = useUser()
  const sharesSum = sumBy(betsOnAnswer, (bet) =>
    bet.outcome === 'YES' ? bet.shares : -bet.shares
  )
  const showSell = !floatingEqual(sharesSum, 0)
  return (
    <Col className={'h-full w-full justify-end px-0.5'}>
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
            userBets={betsOnAnswer}
            user={user}
          />
        </Row>
      )}
      <Button
        size={size ?? 'sm'}
        color={color}
        className={clsx('!px-1')}
        onClick={(e) => {
          e.stopPropagation()
          track('bet intent', { location: 'answer panel' })
          setOutcome(props.outcome)
        }}
      >
        <Col
          style={{
            height: `${52 + answer.prob * 150}px`,
          }}
          className={
            'min-h-[52px] w-full min-w-[2rem] items-center justify-between '
          }
        >
          <span className={'text-base'}>{formatPercent(answer.prob)}</span>

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

export const SellPanel = (props: {
  contract: CPMMNumericContract
  user: User
  userBets: Bet[]
}) => {
  const { contract, user, userBets } = props
  const [showSellButtons, setShowSellButtons] = useState(false)
  const metric = getContractBetMetrics(contract, userBets)
  if (floatingEqual(metric.invested, 0)) return null
  const userBetsByAnswer = groupBy(userBets, (bet) => bet.answerId)
  return (
    <Col className={'mt-2 gap-2'}>
      <Button
        color={'gray-outline'}
        className={'w-24'}
        size={'sm'}
        onClick={() => setShowSellButtons(!showSellButtons)}
      >
        {showSellButtons ? 'Hide' : 'Show'} sell
      </Button>
      <Row className={'flex-wrap gap-1 sm:gap-2'}>
        {showSellButtons &&
          contract.answers.map((a) =>
            userBetsByAnswer[a.id] ? (
              <SellButton
                key={a.id}
                answer={a}
                contract={contract}
                userBets={userBetsByAnswer[a.id]}
                user={user}
              />
            ) : null
          )}
      </Row>
    </Col>
  )
}

export const SellButton = (props: {
  answer: Answer
  contract: CPMMMultiContract | CPMMNumericContract
  userBets: Bet[]
  user: User
}) => {
  const { answer, contract, userBets, user } = props
  const [open, setOpen] = useState(false)
  const sharesSum = sumBy(userBets, (bet) =>
    bet.outcome === 'YES' ? bet.shares : -bet.shares
  )
  if (floatingEqual(sharesSum, 0)) return null
  return (
    <Col>
      {open && (
        <SellSharesModal
          contract={contract}
          user={user}
          userBets={userBets}
          shares={Math.abs(sharesSum)}
          sharesOutcome={sharesSum > 0 ? 'YES' : 'NO'}
          setOpen={setOpen}
          answerId={answer.id}
        />
      )}
      <Button color={'gray-outline'} onClick={() => setOpen(true)}>
        <Col>
          <span>{answer.text}</span>
          <span>Sell {Math.round(sharesSum)} shares</span>
        </Col>
      </Button>
    </Col>
  )
}
