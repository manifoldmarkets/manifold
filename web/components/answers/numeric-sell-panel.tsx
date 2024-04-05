import { CPMMNumericContract } from 'common/contract'
import { Col } from 'web/components/layout/col'
import { Answer } from 'common/answer'
import { Button } from 'web/components/buttons/button'
import { useMemo, useState } from 'react'
import { debounce, find, groupBy, mapValues, sum, sumBy } from 'lodash'
import { floatingEqual } from 'common/util/math'
import clsx from 'clsx'
import { formatMoney } from 'common/util/format'
import { RangeSlider } from 'web/components/widgets/slider'
import { api } from 'web/lib/firebase/api'
import { removeUndefinedProps } from 'common/util/object'
import { filterDefined } from 'common/util/array'
import { toast } from 'react-hot-toast'
import {
  getExpectedValue,
  answerTextToRange,
  getRangeContainingValues,
  answerToMidpoint,
  formatExpectedValue,
} from 'common/multi-numeric'
import { Bet } from 'common/bet'
import { calculateCpmmMultiArbitrageSellYesEqually } from 'common/calculate-cpmm-arbitrage'
import { useUnfilledBetsAndBalanceByUserId } from 'web/hooks/use-bets'
import { SizedContainer } from 'web/components/sized-container'
import { MultiNumericDistributionChart } from 'web/components/answers/numeric-bet-panel'
import { Row } from 'web/components/layout/row'
import { getInvested } from 'common/calculate'

export const NumericSellPanel = (props: {
  contract: CPMMNumericContract
  userBets: Bet[]
}) => {
  const { contract, userBets } = props
  const { answers, min: minimum, max: maximum } = contract
  const expectedValue = getExpectedValue(contract)
  const userNonRedemptionBetsByAnswer = groupBy(
    userBets.filter((bet) => bet.shares !== 0),
    (bet) => bet.answerId
  )

  const answersToSharesIn = mapValues(userNonRedemptionBetsByAnswer, (bets) =>
    sumBy(bets, (b) => b.shares)
  )
  const answersWithSharesIn = answers.filter((a) => answersToSharesIn[a.id] > 0)
  const rangeWithSharesIn = getRangeContainingValues(
    answersWithSharesIn.map(answerToMidpoint),
    contract
  )
  const [range, setRange] = useState<[number, number]>(rangeWithSharesIn)
  const [debouncedRange, setDebouncedRange] =
    useState<[number, number]>(rangeWithSharesIn)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const { unfilledBets, balanceByUserId } = useUnfilledBetsAndBalanceByUserId(
    contract.id
  )
  const stringifiedAnswers = JSON.stringify(answers)

  const roundToEpsilon = (num: number) => Number(num.toFixed(2))

  const shouldIncludeAnswer = (a: Answer) => {
    const answerRange = answerTextToRange(a.text)
    return (
      answerRange[0] >= range[0] &&
      answerRange[1] <= range[1] &&
      answersToSharesIn[a.id] > 0
    )
  }
  const answerIdsToSell = answers
    .filter((a) => shouldIncludeAnswer(a))
    .map((a) => a.id)
  const sharesInAnswersToSell = sum(
    answerIdsToSell.map((a) => answersToSharesIn[a])
  )

  const sellShares = async () => {
    setIsSubmitting(true)
    toast
      .promise(
        api(
          'multi-sell',
          removeUndefinedProps({
            contractId: contract.id,
            answerIds: filterDefined(answerIdsToSell),
          })
        ),
        {
          loading: 'Selling shares...',
          success: 'Shares sold!',
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

  const {
    potentialPayout,
    potentialExpectedValue,
    potentialContractState,
    loanPaid,
    invested,
  } = useMemo(() => {
    const nullRes = {
      potentialPayout: 0,
      potentialExpectedValue: expectedValue,
      potentialContractState: contract,
      loanPaid: 0,
      invested: 0,
    }
    if (sharesInAnswersToSell <= 0 || !answerIdsToSell.length) return nullRes
    const betsOnAnswersToSell = userBets.filter(
      (bet) => bet.answerId && answerIdsToSell.includes(bet.answerId)
    )
    const invested = getInvested(contract, betsOnAnswersToSell)

    const userBetsToSellByAnswerId = groupBy(
      betsOnAnswersToSell.filter((bet) => bet.shares !== 0),
      (bet) => bet.answerId
    )
    const loanPaid = sumBy(betsOnAnswersToSell, (bet) => bet.loanAmount ?? 0)
    const { newBetResults, updatedAnswers } =
      calculateCpmmMultiArbitrageSellYesEqually(
        contract.answers,
        userBetsToSellByAnswerId,
        unfilledBets,
        balanceByUserId
      )
    const potentialPayout = sumBy(
      newBetResults.flatMap((r) => r.takers),
      (taker) => -taker.amount
    )

    const potentialContractState = {
      ...contract,
      answers: answers.map(
        (a) => find(updatedAnswers, (update) => update.id === a.id) ?? a
      ),
    }
    const potentialExpectedValue = getExpectedValue(potentialContractState)

    return {
      loanPaid,
      invested,
      potentialPayout,
      potentialExpectedValue,
      potentialContractState,
    }
  }, [
    JSON.stringify(userBets),
    stringifiedAnswers,
    unfilledBets,
    JSON.stringify(balanceByUserId),
    debouncedRange,
  ])
  const isLoanOwed = loanPaid > 0
  const profit = potentialPayout - invested
  const netProceeds = potentialPayout - loanPaid
  return (
    <Col className={'gap-2'}>
      <Col className={'mb-2 gap-2'}>
        <SizedContainer
          className={clsx('h-[150px] w-full pb-3 pl-2 pr-10 sm:h-[200px]')}
        >
          {(w, h) => (
            <MultiNumericDistributionChart
              contract={contract}
              updatedContract={potentialContractState}
              width={w}
              height={h}
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
      <Row className="text-ink-500  items-center justify-between gap-2">
        <span className={''}>Sale value:</span>
        <span className="text-ink-700">{formatMoney(potentialPayout)}</span>
      </Row>
      {isLoanOwed && (
        <Row className="text-ink-500  items-center justify-between gap-2">
          Loan repayment
          <span className="text-ink-700">
            {formatMoney(Math.floor(-loanPaid))}
          </span>
        </Row>
      )}
      <Row className="text-ink-500 items-center justify-between gap-2">
        Profit
        <span className="text-ink-700">{formatMoney(profit)}</span>
      </Row>
      <Row className="items-center justify-between">
        <div className="text-ink-500">{'Expected value'}</div>
        <div>
          {formatExpectedValue(expectedValue, contract)}
          <span className="mx-2">→</span>
          {formatExpectedValue(potentialExpectedValue, potentialContractState)}
        </div>
      </Row>
      <Row className="text-ink-1000 mt-4 items-center justify-between gap-2 text-xl">
        Payout
        <span className="text-ink-700">{formatMoney(netProceeds)}</span>
      </Row>

      <Row className={'justify-end'}>
        <Button
          disabled={isSubmitting || sharesInAnswersToSell <= 0}
          onClick={sellShares}
          loading={isSubmitting}
        >
          Sell {Math.floor(sharesInAnswersToSell)} shares
        </Button>
      </Row>
    </Col>
  )
}
export const MultiNumericSellPanel = (props: {
  contract: CPMMNumericContract
  userBets: Bet[]
}) => {
  const { contract, userBets } = props
  const [showSellPanel, setShowSellPanel] = useState(false)
  const totalShares = sumBy(userBets, (bet) => bet.shares)
  if (floatingEqual(totalShares, 0)) return null

  return (
    <Col className={'mt-2 gap-2'}>
      <Button
        color={'gray-outline'}
        className={'w-48'}
        size={'sm'}
        onClick={async () => {
          setShowSellPanel(!showSellPanel)
        }}
      >
        {showSellPanel ? 'Hide' : 'Show'} sell shares panel
      </Button>
      {showSellPanel && (
        <NumericSellPanel contract={contract} userBets={userBets} />
      )}
    </Col>
  )
}
