import { CPMMNumericContract } from 'common/contract'
import { Row } from 'web/components/layout/row'
import { Col } from 'web/components/layout/col'
import { Answer } from 'common/answer'
import { Button, IconButton } from 'web/components/buttons/button'
import { useEffect, useMemo, useState } from 'react'
import { capitalize, debounce, find, first, sumBy } from 'lodash'
import clsx from 'clsx'
import { formatMoney, formatPercent } from 'common/util/format'
import { RangeSlider } from 'web/components/widgets/slider'
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
  answerTextToRange,
  getExpectedValuesArray,
  NEW_GRAPH_COLOR,
} from 'common/multi-numeric'
import { XIcon } from '@heroicons/react/solid'
import { calculateCpmmMultiArbitrageYesBets } from 'common/calculate-cpmm-arbitrage'
import { useUnfilledBetsAndBalanceByUserId } from 'web/hooks/use-bets'
import { QuickBetAmountsRow } from 'web/components/bet/bet-panel'
import { scaleLinear } from 'd3-scale'
import { DoubleDistributionChart } from 'web/components/charts/generic-charts'
import { NUMERIC_GRAPH_COLOR } from 'common/numeric-constants'
import { SizedContainer } from 'web/components/sized-container'

export const NumericBetPanel = (props: {
  contract: CPMMNumericContract
  labels?: {
    lower: string
    about: string
    higher: string
  }
}) => {
  const {
    contract,
    labels = {
      lower: 'Lower',
      about: 'About right',
      higher: 'Higher',
    },
  } = props
  const { answers, min: minimum, max: maximum } = contract
  const [expectedValue, setExpectedValue] = useState(getExpectedValue(contract))
  const [betAmount, setBetAmount] = useState<number | undefined>(10)
  const [range, setRange] = useState<[number, number]>([minimum, maximum])
  const [debouncedRange, setDebouncedRange] = useState<[number, number]>([
    minimum,
    maximum,
  ])
  const [debouncedAmount, setDebouncedAmount] = useState(betAmount)
  const [mode, setMode] = useState<
    'less than' | 'more than' | 'about right' | undefined
  >(undefined)
  const isAdvancedTrader = useIsAdvancedTrader()
  const [showDistribution, setShowDistribution] = useState(isAdvancedTrader)
  useEffect(() => {
    setShowDistribution(isAdvancedTrader)
  }, [isAdvancedTrader])
  const [error, setError] = useState<string | undefined>()
  const [inputRef, focusAmountInput] = useFocus()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { unfilledBets, balanceByUserId } = useUnfilledBetsAndBalanceByUserId(
    contract.id
  )
  const stringifiedAnswers = JSON.stringify(answers)

  const betLabel = showDistribution
    ? `${range[0]} ≤ val < ${range[1]}`
    : mode === 'less than'
    ? `${capitalize(labels.lower)} than ` +
      formatExpectedValue(range[1], contract)
    : mode === 'more than'
    ? formatExpectedValue(range[0], contract) + ` or ${labels.higher}`
    : `${range[0]} ≤ val < ${range[1]}`

  const modeColor =
    mode === 'less than'
      ? 'red'
      : mode === 'more than'
      ? 'green'
      : mode === 'about right'
      ? 'blue'
      : 'gray-outline'

  const roundToEpsilon = (num: number) => Number(num.toFixed(2))
  const shouldIncludeAnswer = (a: Answer) => {
    const answerRange = answerTextToRange(a.text)
    return answerRange[0] >= range[0] && answerRange[1] <= range[1]
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

  const debounceRange = useMemo(
    () =>
      debounce((range: number[]) => {
        setDebouncedRange(range as [number, number])
      }, 300),
    []
  )
  const updateBetAmount = (amount: number | undefined) => {
    setBetAmount(amount)
    debounceAmount(amount)
  }

  const debounceAmount = useMemo(
    () =>
      debounce((amount: number | undefined) => {
        setDebouncedAmount(amount)
      }, 200),
    []
  )

  const onChangeRange = (low: number, high: number) => {
    if (low === high) return
    setRange([
      roundToEpsilon(low),
      roundToEpsilon(
        high !== range[1] ? (high === maximum ? maximum : high) : range[1]
      ),
    ])
    debounceRange(range)
  }

  const changeMode = (newMode: 'less than' | 'more than' | 'about right') => {
    const newExpectedValue = getExpectedValue(contract)
    setExpectedValue(newExpectedValue)

    const midPointBucket = getRangeContainingValue(
      newExpectedValue,
      answers.map((a) => a.text),
      minimum,
      maximum
    )
    if (newMode === 'about right') {
      setRange(midPointBucket)
    } else if (newMode === 'less than') {
      setRange([minimum, midPointBucket[1]])
    } else if (newMode === 'more than') {
      setRange([midPointBucket[0], maximum])
    }
    if (!isIOS() && !isAndroid()) {
      focusAmountInput()
    }
    setMode(newMode)
  }

  const {
    currentReturnPercent,
    potentialPayout,
    potentialExpectedValue,
    potentialContractState,
  } = useMemo(() => {
    if (!betAmount || !answersToBuy || !mode)
      return {
        currentReturnPercent: '0%',
        potentialPayout: 0,
        potentialExpectedValue: expectedValue,
        potentialContractState: contract,
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
    const potentialContractState = {
      ...contract,
      answers: answers.map(
        (a) => find(updatedAnswers, (update) => update.id === a.id) ?? a
      ),
    }
    const potentialExpectedValue = getExpectedValue(potentialContractState)
    // console.log('potentialPayout', potentialPayout)

    return {
      currentReturnPercent,
      potentialPayout,
      potentialExpectedValue,
      potentialContractState,
    }
  }, [
    debouncedAmount,
    stringifiedAnswers,
    unfilledBets,
    JSON.stringify(balanceByUserId),
    debouncedRange,
    mode,
  ])

  return (
    <Col className={'gap-2'}>
      {showDistribution && !!mode && (
        <Col className={'gap-2'}>
          <span className={' text-xl'}>Probability Distribution</span>
          <Row className={'gap-4'}>
            <Row className={'gap-1'}>
              <svg width="20" height="20" viewBox="0 0 120 120">
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  fill={NUMERIC_GRAPH_COLOR}
                  opacity={0.7}
                />
              </svg>
              <span className={'text-ink-500 text-sm'}>Before purchase</span>
            </Row>
            <Row className={'gap-1'}>
              <svg width="20" height="20" viewBox="0 0 120 120">
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  fill={NEW_GRAPH_COLOR}
                  opacity={0.7}
                />
              </svg>
              <span className={'text-ink-500 text-sm'}>After purchase</span>
            </Row>
          </Row>
          <Col className={'mb-2 gap-2'}>
            <SizedContainer
              className={clsx('h-[150px] w-full pb-3 pl-2 pr-10 sm:h-[200px]')}
            >
              {(w, h) => (
                <MultiNumericDistributionChart
                  newColor={NEW_GRAPH_COLOR}
                  contract={contract}
                  updatedContract={potentialContractState}
                  width={w}
                  height={h}
                  range={range}
                />
              )}
            </SizedContainer>
            <RangeSlider
              step={Math.abs(maximum - minimum) / contract.answers.length}
              color={'indigo'}
              className={'mr-8 h-4 items-end'}
              highValue={range[1]}
              lowValue={range[0]}
              setValues={onChangeRange}
              min={minimum}
              max={maximum}
            />
          </Col>
        </Col>
      )}
      {mode === undefined ? (
        <Row className={'items-center justify-center gap-2'}>
          <Button
            color={'red'}
            size={'xl'}
            onClick={() => changeMode('less than')}
            className={'grow'}
          >
            {capitalize(labels.lower)}
          </Button>
          <Button
            color={'blue'}
            size={'xl'}
            className={'grow'}
            onClick={() => changeMode('about right')}
          >
            {capitalize(labels.about)}
          </Button>
          <Button
            color={'green'}
            size={'xl'}
            className={'grow'}
            onClick={() => changeMode('more than')}
          >
            {capitalize(labels.higher)}
          </Button>
        </Row>
      ) : (
        <Col
          className={clsx(
            'mt-2 gap-4 rounded-md px-3 py-2',
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
                {showDistribution ? 'Default' : 'Advanced'}
              </Button>
              <IconButton
                className={'w-12'}
                onClick={() => setMode(undefined)}
                disabled={isSubmitting}
              >
                <XIcon className={'h-4 w-4'} />
              </IconButton>
            </Row>
          </Row>
          <QuickBetAmountsRow
            onAmountChange={updateBetAmount}
            betAmount={betAmount}
          />
          <Row className={' flex-wrap gap-2'}>
            <BuyAmountInput
              parentClassName={isAdvancedTrader ? '' : '!w-64'}
              amount={betAmount}
              onChange={updateBetAmount}
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
                <span className={'text-ink-700'}>New expected value:</span>
                {formatExpectedValue(potentialExpectedValue, contract)}
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
              Bet {formatMoney(betAmount ?? 0)} on {betLabel}
            </Button>
          </Row>
        </Col>
      )}
    </Col>
  )
}

export const MultiNumericDistributionChart = (props: {
  contract: CPMMNumericContract
  updatedContract: CPMMNumericContract
  width: number
  height: number
  range: [number, number]
  newColor: string
  shadedRanges?: [number, number][]
}) => {
  const {
    contract,
    shadedRanges,
    newColor,
    range,
    updatedContract,
    width,
    height,
  } = props
  const { min, max } = contract
  const data = useMemo(() => getExpectedValuesArray(contract), [contract])
  const otherData = useMemo(
    () => getExpectedValuesArray(updatedContract),
    [updatedContract]
  )
  const maxY = Math.max(...data.map((d) => d.y))
  const otherMaxY = Math.max(...otherData.map((d) => d.y))
  const xScale = scaleLinear([min, max], [0, width])
  const yScale = scaleLinear([0, Math.min(maxY + 0.05, 1)], [height, 0])
  const otherYScale = scaleLinear(
    [0, Math.min(otherMaxY + 0.05, 1)],
    [height, 0]
  )

  return (
    <DoubleDistributionChart
      w={width}
      h={height}
      xScale={xScale}
      yScale={maxY > otherMaxY ? yScale : otherYScale}
      data={data}
      otherData={otherData}
      color={NUMERIC_GRAPH_COLOR}
      verticalLines={range}
      shadedRanges={shadedRanges}
      newColor={newColor}
    />
  )
}
