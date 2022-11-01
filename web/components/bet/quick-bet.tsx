import clsx from 'clsx'
import {
  getOutcomeProbability,
  getOutcomeProbabilityAfterBet,
  getProbability,
  getTopAnswer,
  getTopNSortedAnswers,
  getContractBetMetrics,
} from 'common/calculate'
import { getExpectedValue } from 'common/calculate-dpm'
import { User } from 'common/user'
import {
  BinaryContract,
  Contract,
  FreeResponseContract,
  MultipleChoiceContract,
  NumericContract,
  PseudoNumericContract,
  resolution,
} from 'common/contract'
import {
  formatLargeNumber,
  formatMoney,
  formatPercent,
} from 'common/util/format'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useUserContractBets } from 'web/hooks/use-user-bets'
import { placeBet } from 'web/lib/firebase/api'
import { getBinaryProbPercent } from 'web/lib/firebase/contracts'
import { useSaveBinaryShares } from '../../hooks/use-save-binary-shares'
import { sellShares } from 'web/lib/firebase/api'
import { calculateCpmmSale, getCpmmProbability } from 'common/calculate-cpmm'
import { track } from 'web/lib/service/analytics'
import { formatNumericProbability } from 'common/pseudo-numeric'
import { useUnfilledBetsAndBalanceByUserId } from 'web/hooks/use-bets'
import { getBinaryProb } from 'common/contract-details'
import { Row } from '../layout/row'
import { Col } from '../layout/col'
import { Answer } from 'common/answer'
import { AnswerLabel } from '../outcome-label'
import { useChartAnswers } from '../charts/contract/choice'
import { getAnswerColor } from '../answers/answers-panel'
import EquilateralLeftTriangle from 'web/lib/icons/equilateral-left-triangle'
import EquilateralRightTriangle from 'web/lib/icons/equilateral-right-triangle'
import { floor } from 'lodash'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { Bet } from 'common/bet'

const BET_SIZE = 10

export function QuickBet(props: {
  contract: BinaryContract | PseudoNumericContract
  user: User
  className?: string
}) {
  const { contract, user, className } = props
  const userBets = useUserContractBets(user.id, contract.id) || []

  const { mechanism } = contract
  const isCpmm = mechanism === 'cpmm-1'
  // TODO: Below hook fetches a decent amount of data. Maybe not worth it to show prob change on hover?
  const { unfilledBets, balanceByUserId } = useUnfilledBetsAndBalanceByUserId(
    contract.id
  )

  const { yesShares, noShares } = useSaveBinaryShares(contract, userBets)

  const [upHover, setUpHover] = useState(false)
  const [downHover, setDownHover] = useState(false)

  let previewProb = undefined
  try {
    previewProb = upHover
      ? getOutcomeProbabilityAfterBet(
          contract,
          quickOutcome(contract, 'UP') || '',
          BET_SIZE
        )
      : downHover
      ? 1 -
        getOutcomeProbabilityAfterBet(
          contract,
          quickOutcome(contract, 'DOWN') || '',
          BET_SIZE
        )
      : undefined
  } catch (e) {
    // Catch any errors from hovering on an invalid option
  }

  let sharesSold: number | undefined
  let sellOutcome: 'YES' | 'NO' | undefined
  let saleAmount: number | undefined
  if (isCpmm && (upHover || downHover)) {
    const oppositeShares = upHover ? noShares : yesShares
    if (oppositeShares) {
      sellOutcome = upHover ? 'NO' : 'YES'

      const prob = getProb(contract)
      const maxSharesSold = BET_SIZE / (sellOutcome === 'YES' ? prob : 1 - prob)
      sharesSold = Math.min(oppositeShares, maxSharesSold)

      const { cpmmState, saleValue } = calculateCpmmSale(
        contract,
        sharesSold,
        sellOutcome,
        unfilledBets,
        balanceByUserId
      )
      saleAmount = saleValue
      previewProb = getCpmmProbability(cpmmState.pool, cpmmState.p)
    }
  }

  async function placeQuickBet(direction: 'UP' | 'DOWN') {
    const betPromise = async () => {
      if (sharesSold && sellOutcome) {
        return await sellShares({
          shares: sharesSold,
          outcome: sellOutcome,
          contractId: contract.id,
        })
      }

      const outcome = quickOutcome(contract, direction)
      return await placeBet({
        amount: BET_SIZE,
        outcome,
        contractId: contract.id,
      })
    }
    const shortQ = contract.question.slice(0, 20)
    const message =
      sellOutcome && saleAmount
        ? `${formatMoney(saleAmount)} sold of "${shortQ}"...`
        : `${formatMoney(BET_SIZE)} on "${shortQ}"...`

    toast.promise(betPromise(), {
      loading: message,
      success: message,
      error: (err) => `${err.message}`,
    })

    track('quick bet', {
      slug: contract.slug,
      direction,
      contractId: contract.id,
    })
  }

  return (
    <div className="relative">
      <Row className={clsx(className, 'absolute inset-0')}>
        <BinaryQuickBetButton
          onClick={() => placeQuickBet('DOWN')}
          direction="DOWN"
          contract={contract}
          hover={downHover}
          onMouseEnter={() => setDownHover(true)}
          onMouseLeave={() => setDownHover(false)}
          userBets={userBets}
        />
        <BinaryQuickBetButton
          onClick={() => placeQuickBet('UP')}
          direction="UP"
          contract={contract}
          hover={upHover}
          onMouseEnter={() => setUpHover(true)}
          onMouseLeave={() => setUpHover(false)}
          userBets={userBets}
        />
      </Row>
      <QuickOutcomeView contract={contract} previewProb={previewProb} />
    </div>
  )
}

function BinaryQuickBetButton(props: {
  onClick: () => void
  direction: 'UP' | 'DOWN'
  contract: BinaryContract | PseudoNumericContract
  hover: boolean
  onMouseEnter: () => void
  onMouseLeave: () => void
  userBets: Bet[]
}) {
  const {
    onClick,
    direction,
    contract,
    hover,
    onMouseEnter,
    onMouseLeave,
    userBets,
  } = props
  const { invested } = getContractBetMetrics(contract, userBets)
  const { hasYesShares, hasNoShares } = useSaveBinaryShares(contract, userBets)
  let hasInvestment = false
  if (direction === 'UP') {
    hasInvestment =
      hasYesShares === true && invested != undefined && floor(invested) > 0
  } else {
    hasInvestment =
      hasNoShares === true && invested != undefined && floor(invested) > 0
  }
  const isMobile = useIsMobile()
  const shouldFocus = hover && !isMobile
  return (
    <Row
      className={clsx(
        'w-[50%] items-center gap-2',
        direction === 'UP' && 'flex-row-reverse'
      )}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    >
      {direction === 'DOWN' && (
        <EquilateralLeftTriangle
          className={clsx(
            'mx-2 h-6 w-6 drop-shadow-md transition-all',
            shouldFocus
              ? 'animate-bounce-left text-indigo-600'
              : hasInvestment
              ? 'text-indigo-800'
              : 'text-indigo-400'
          )}
        />
      )}
      {direction === 'UP' && (
        <EquilateralRightTriangle
          className={clsx(
            'mx-2 h-6 w-6 drop-shadow-md transition-all',
            shouldFocus
              ? 'sm:animate-bounce-right text-indigo-600'
              : hasInvestment
              ? 'text-indigo-800'
              : 'text-indigo-400'
          )}
        />
      )}
      {hasInvestment && invested != null ? (
        <span
          className={clsx(
            'text-sm font-light',
            shouldFocus ? 'text-indigo-600' : 'text-indigo-800'
          )}
        >
          {shouldFocus
            ? formatMoney(invested + BET_SIZE)
            : formatMoney(invested)}
        </span>
      ) : (
        <span
          className={clsx(
            'my-auto text-sm font-light text-indigo-600 transition-opacity',
            shouldFocus ? 'opacity-100' : 'opacity-0'
          )}
        >
          {formatMoney(BET_SIZE)}
        </span>
      )}
    </Row>
  )
}

function quickOutcome(contract: Contract, direction: 'UP' | 'DOWN') {
  const { outcomeType } = contract

  if (outcomeType === 'BINARY' || outcomeType === 'PSEUDO_NUMERIC') {
    return direction === 'UP' ? 'YES' : 'NO'
  }
  if (outcomeType === 'FREE_RESPONSE') {
    // TODO: Implement shorting of free response answers
    if (direction === 'DOWN') {
      throw new Error("Can't bet against free response answers")
    }
    return getTopAnswer(contract)?.id
  }
  if (outcomeType === 'NUMERIC') {
    // TODO: Ideally an 'UP' bet would be a uniform bet between [current, max]
    throw new Error("Can't quick bet on numeric markets")
  }
}

export function QuickOutcomeView(props: {
  contract: Contract
  previewProb?: number
}) {
  const { contract, previewProb } = props
  const { outcomeType } = contract
  const isPseudoNumeric = outcomeType === 'PSEUDO_NUMERIC'
  const prob = previewProb ?? getProb(contract)

  // If there's a preview prob, display that instead of the current prob
  const override =
    previewProb === undefined
      ? undefined
      : isPseudoNumeric
      ? formatNumericProbability(previewProb, contract)
      : formatPercent(previewProb)

  const textColor = getTextColor(contract)

  let display: string | undefined
  switch (outcomeType) {
    case 'BINARY':
      display = getBinaryProbPercent(contract)
      break
    case 'PSEUDO_NUMERIC':
      display = formatNumericProbability(getProbability(contract), contract)
      break
    case 'NUMERIC':
      display = formatLargeNumber(getExpectedValue(contract))
      break
    case 'FREE_RESPONSE': {
      const topAnswer = getTopAnswer(contract)
      display =
        topAnswer &&
        formatPercent(getOutcomeProbability(contract, topAnswer.id))
      break
    }
  }

  if (outcomeType != 'FREE_RESPONSE' && outcomeType != 'MULTIPLE_CHOICE') {
    return (
      <div
        className={clsx(
          'relative h-8 w-full overflow-hidden rounded-md',
          getBgColor(contract)
        )}
      >
        <div
          className={clsx('h-full transition-all', getBarColor(contract))}
          style={{ width: `${100 * prob}%` }}
          aria-hidden
        />
        <div
          className={`absolute inset-0 flex items-center justify-center gap-1 text-xl font-semibold ${textColor}`}
        >
          <CardText contract={contract} override={override} display={display} />
        </div>
      </div>
    )
  }

  return <ContractCardAnswers contract={contract} />
}

export function CardText(props: {
  contract: Contract
  override?: string
  display?: string
}) {
  const { contract, override, display } = props
  const resolution = contract.resolution
  if (resolution) {
    if (resolution === 'MKT' && contract.resolutionProbability) {
      return (
        <>
          <span className="my-auto text-sm font-normal">resolved as </span>
          {formatPercent(contract.resolutionProbability)}
        </>
      )
    }
    if (resolution === 'CANCEL') {
      return <>{'CANCELLED'}</>
    }
    return (
      <>
        <span className="text-sm font-normal">resolved </span>
        {resolution}
      </>
    )
  }
  if (override) {
    return <>{override}</>
  }
  return <>{display}</>
}

export function ContractCardAnswers(props: {
  contract: FreeResponseContract | MultipleChoiceContract
}) {
  const { contract } = props
  const answers = getTopNSortedAnswers(contract, 3)
  const answersArray = useChartAnswers(contract).map(
    (answer, _index) => answer.text
  )
  if (answers.length === 0) {
    return <div>No answers yet...</div>
  }
  return (
    <Col className="gap-2">
      {answers.map((answer) => (
        <ContractCardAnswer
          key={answer.id}
          contract={contract}
          answer={answer}
          answersArray={answersArray}
          type={getAnswerType(
            answer,
            contract.resolution,
            contract.resolutions
          )}
        />
      ))}
    </Col>
  )
}

function getAnswerType(
  answer: Answer,
  resolution?: string,
  resolutions?:
    | { [outcome: string]: number }
    | { [outcome: string]: number }
    | undefined
) {
  if (answer.id === resolution || (resolutions && resolutions[answer.id])) {
    return 'winner'
  }
  if (!resolution) {
    return 'contender'
  }
  return 'loser'
}

function ContractCardAnswer(props: {
  contract: FreeResponseContract | MultipleChoiceContract
  answer: Answer
  answersArray: string[]
  type: 'winner' | 'loser' | 'contender'
}) {
  const { contract, answer, answersArray, type } = props
  const prob = getOutcomeProbability(contract, answer.id)
  const display = formatPercent(getOutcomeProbability(contract, answer.id))
  const color = getAnswerColor(answer, answersArray)
  const isClosed = (contract.closeTime ?? Infinity) < Date.now()
  return (
    <div
      className={clsx(
        type === 'winner'
          ? '-mx-[1.5px] -my-[1.5px] rounded-lg bg-gradient-to-br from-indigo-500 via-purple-500 to-fuchsia-500 px-[1.5px] py-[1.5px]'
          : ''
      )}
    >
      <Row
        className={clsx(
          'z-50 justify-between rounded-md px-4 py-0.5 transition-all'
        )}
        style={{
          background: `linear-gradient(to right, ${
            type === 'loser' || (isClosed && type === 'contender')
              ? '#D8D8EB'
              : `${color}`
          } ${100 * prob}%, ${'#F4F4FB'} ${100 * prob}%)`,
        }}
      >
        <AnswerLabel
          className={clsx(
            'text-md',
            type === 'loser' ? 'text-greyscale-5' : 'text-greyscale-7'
          )}
          answer={answer}
          truncate="medium"
        />
        <div
          className={clsx(
            'text-md font-semibold',
            type === 'loser' ? 'text-greyscale-5' : 'text-greyscale-7'
          )}
        >
          {display}
        </div>
      </Row>
    </div>
  )
}

// Return a number from 0 to 1 for this contract
// Resolved contracts are set to 1, for coloring purposes (even if NO)
function getProb(contract: Contract) {
  const { outcomeType, resolution, resolutionProbability } = contract
  return resolutionProbability
    ? resolutionProbability
    : resolution
    ? 1
    : outcomeType === 'BINARY'
    ? getBinaryProb(contract)
    : outcomeType === 'PSEUDO_NUMERIC'
    ? getProbability(contract)
    : outcomeType === 'FREE_RESPONSE' || outcomeType === 'MULTIPLE_CHOICE'
    ? getOutcomeProbability(contract, getTopAnswer(contract)?.id || '')
    : outcomeType === 'NUMERIC'
    ? getNumericScale(contract)
    : 1 // Should not happen
}

function getNumericScale(contract: NumericContract) {
  const { min, max } = contract
  const ev = getExpectedValue(contract)
  return (ev - min) / (max - min)
}

const OUTCOME_TO_COLOR_BAR = {
  YES: 'bg-teal-200',
  NO: 'bg-scarlet-200',
  CANCEL: 'bg-greyscale-1.5',
  MKT: 'bg-sky-200',
}

export function getBarColor(contract: Contract) {
  const { resolution } = contract

  if (resolution) {
    return OUTCOME_TO_COLOR_BAR[resolution as resolution] ?? 'bg-indigo-100'
  }

  if ((contract.closeTime ?? Infinity) < Date.now()) {
    return 'bg-slate-300'
  }

  return 'bg-indigo-100'
}

const OUTCOME_TO_COLOR_BACKGROUND = {
  YES: 'bg-teal-100',
  NO: 'bg-scarlet-100',
  CANCEL: 'bg-greyscale-1.5',
  MKT: 'bg-sky-100',
}

export function getBgColor(contract: Contract) {
  const { resolution } = contract

  if (resolution) {
    return (
      OUTCOME_TO_COLOR_BACKGROUND[resolution as resolution] ??
      'bg-greyscale-1.5'
    )
  }

  // if ((contract.closeTime ?? Infinity) < Date.now()) {
  //   return 'bg-greyscale-1.5'
  // }

  return 'bg-greyscale-1.5'
}

const OUTCOME_TO_COLOR_TEXT = {
  YES: 'text-teal-600',
  NO: 'text-scarlet-600',
  CANCEL: 'text-greyscale-4',
  MKT: 'text-sky-600',
}

export function getTextColor(contract: Contract) {
  const { resolution } = contract

  if (resolution) {
    return OUTCOME_TO_COLOR_TEXT[resolution as resolution] ?? 'text-indigo-200'
  }

  if ((contract.closeTime ?? Infinity) < Date.now()) {
    return 'text-greyscale-6'
  }

  return 'text-greyscale-7'
}
