import clsx from 'clsx'
import {
  getOutcomeProbability,
  getOutcomeProbabilityAfterBet,
  getProbability,
  getTopAnswer,
  getTopNSortedAnswers,
  getContractBetMetrics,
  calculatePayout,
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
import { floor, sumBy } from 'lodash'
import { useIsMobile } from 'web/hooks/use-is-mobile'

const BET_SIZE = 10

export function QuickBet(props: {
  contract: BinaryContract | PseudoNumericContract
  user: User
  className?: string
}) {
  const { contract, user, className } = props
  const { mechanism } = contract
  const isCpmm = mechanism === 'cpmm-1'

  const userBets = useUserContractBets(user.id, contract.id)
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
    <div className="mx-y relative">
      <Row
        className={clsx(
          className,
          'absolute my-auto mt-1 w-full items-center justify-between px-2 align-middle'
        )}
      >
        <BinaryQuickBetButton
          onClick={() => placeQuickBet('DOWN')}
          direction="DOWN"
          user={user}
          contract={contract}
          hover={downHover}
          onMouseEnter={() => setDownHover(true)}
          onMouseLeave={() => setDownHover(false)}
        />
        <BinaryQuickBetButton
          onClick={() => placeQuickBet('UP')}
          direction="UP"
          user={user}
          contract={contract}
          hover={upHover}
          onMouseEnter={() => setUpHover(true)}
          onMouseLeave={() => setUpHover(false)}
        />
      </Row>
      <QuickOutcomeView contract={contract} previewProb={previewProb} />
    </div>
  )
}

function BinaryQuickBetButton(props: {
  onClick: () => void
  direction: 'UP' | 'DOWN'
  user: User
  contract: Contract
  hover: boolean
  onMouseEnter: () => void
  onMouseLeave: () => void
}) {
  const {
    onClick,
    direction,
    user,
    contract,
    hover,
    onMouseEnter,
    onMouseLeave,
  } = props
  const userBets = useUserContractBets(user.id, contract.id)
  let yesWinnings,
    noWinnings,
    position,
    outcome,
    invested = null
  const bets = userBets?.filter((b) => !b.isAnte)
  if (bets) {
    const metrics = getContractBetMetrics(contract, bets)
    invested = metrics.invested
    const excludeSales = bets.filter((b) => !b.isSold && !b.sale)
    yesWinnings = sumBy(excludeSales, (bet) =>
      calculatePayout(contract, bet, 'YES')
    )
    noWinnings = sumBy(excludeSales, (bet) =>
      calculatePayout(contract, bet, 'NO')
    )
    position = yesWinnings - noWinnings
    outcome = position < 0 ? 'NO' : 'YES'
  }
  let hasInvestment = false
  if (direction === 'UP') {
    hasInvestment = outcome === 'YES' && invested != null && floor(invested) > 0
  } else {
    hasInvestment = outcome === 'NO' && invested != null && floor(invested) > 0
  }
  const isMobile = useIsMobile()
  return (
    <Row
      className={clsx(
        'items-center gap-1',
        direction === 'UP' ? 'flex-row-reverse' : ''
      )}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    >
      {direction === 'DOWN' && (
        <EquilateralLeftTriangle
          className={clsx(
            'mx-auto h-6 w-6 transition-all',
            hover && !isMobile
              ? 'animate-bounce-left ease-[cubic-bezier(1, 1, 0.8, 0)] text-indigo-600'
              : hasInvestment
              ? 'text-indigo-900'
              : 'text-indigo-400'
          )}
        />
      )}
      {direction === 'UP' && (
        <EquilateralRightTriangle
          className={clsx(
            'mx-auto h-6 w-6 transition-all',
            hover && !isMobile
              ? 'sm:animate-bounce-right ease-[cubic-bezier(1, 1, 0.8, 0)] text-indigo-600'
              : hasInvestment
              ? 'text-indigo-900'
              : 'text-indigo-400'
          )}
        />
      )}
      {hasInvestment && invested != null ? (
        <span
          className={clsx(
            'text-sm font-light',
            hover && !isMobile ? 'text-indigo-600' : 'text-indigo-900'
          )}
        >
          {hover && !isMobile
            ? formatMoney(invested + BET_SIZE)
            : formatMoney(invested)}
        </span>
      ) : (
        <span
          className={clsx(
            'text-sm font-light text-indigo-600 transition-opacity',
            hover && !isMobile ? 'opacity-100' : 'opacity-0'
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
  caption?: 'chance' | 'expected'
}) {
  const { contract, previewProb, caption } = props
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
      <Row
        className="justify-between rounded-md px-4 py-0.5 transition-all"
        style={{
          background: `linear-gradient(to right, ${getBarColor(contract)} ${
            100 * prob
          }%, ${getBgColor(contract)} ${100 * prob}%)`,
        }}
      >
        <div className={`mx-auto text-xl font-semibold ${textColor}`}>
          {contract.resolution ?? override ?? display}
        </div>
        {caption && <div className="text-base">{caption}</div>}
      </Row>
    )
  }

  return <ContractCardAnswers contract={contract} />
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
            type === 'loser' || isClosed ? '#D8D8EB' : `${color}90`
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
  YES: '#99f6e4',
  NO: '#FFA799',
  CANCEL: '#F4F4FB',
  MKT: '#bae6fd',
}

export function getBarColor(contract: Contract) {
  const { resolution } = contract

  if (resolution) {
    return OUTCOME_TO_COLOR_BAR[resolution as resolution] ?? '#c7d2fe'
  }

  if ((contract.closeTime ?? Infinity) < Date.now()) {
    return '#D8D8EB'
  }

  return '#c7d2fe'
}

const OUTCOME_TO_COLOR_BACKGROUND = {
  YES: '#ccfbf1',
  NO: '#FFD3CC',
  CANCEL: '#F4F4FB',
  MKT: '#F4F4FB',
}

export function getBgColor(contract: Contract) {
  const { resolution } = contract

  if (resolution) {
    return OUTCOME_TO_COLOR_BACKGROUND[resolution as resolution] ?? '#F4F4FB'
  }

  if ((contract.closeTime ?? Infinity) < Date.now()) {
    return '#F4F4FB'
  }

  return '#F4F4FB'
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
    return OUTCOME_TO_COLOR_TEXT[resolution as resolution] ?? '#c7d2fe'
  }

  if ((contract.closeTime ?? Infinity) < Date.now()) {
    return 'text-greyscale-6'
  }

  return 'text-greyscale-7'
}
