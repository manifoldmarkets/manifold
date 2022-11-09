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
import { track, withTracking } from 'web/lib/service/analytics'
import {
  calculateCpmmSale,
  getCpmmProbability,
  getCpmmProbabilityAfterSale,
} from 'common/calculate-cpmm'
import {
  formatNumericProbability,
  getFormattedMappedValue,
} from 'common/pseudo-numeric'
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
import { firebaseLogin } from 'web/lib/firebase/users'

const BET_SIZE = 10

export function QuickBet(props: {
  contract: BinaryContract | PseudoNumericContract
  user?: User | null
  className?: string
}) {
  const { contract, user, className } = props
  if (!user) {
    return <SignedOutQuickBet contract={contract} className={className} />
  }
  return (
    <SignedInQuickBet contract={contract} user={user} className={className} />
  )
}

export function SignedOutQuickBet(props: {
  contract: BinaryContract | PseudoNumericContract
  className?: string
}) {
  const { contract, className } = props
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
  return (
    <div className="relative">
      <Row className={clsx(className, 'absolute inset-0')}>
        <BinaryQuickBetButton
          onClick={withTracking(firebaseLogin, 'landing page button click')}
          direction="DOWN"
          hover={downHover}
          onMouseEnter={() => setDownHover(true)}
          onMouseLeave={() => setDownHover(false)}
        />
        <BinaryQuickBetButton
          onClick={withTracking(firebaseLogin, 'landing page button click')}
          direction="UP"
          hover={upHover}
          onMouseEnter={() => setUpHover(true)}
          onMouseLeave={() => setUpHover(false)}
        />
      </Row>
      <QuickOutcomeView contract={contract} previewProb={previewProb} />
    </div>
  )
}

function SignedInQuickBet(props: {
  contract: BinaryContract | PseudoNumericContract
  user: User
  className?: string
}) {
  const { contract, user, className } = props
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
  const userBets = useUserContractBets(user.id, contract.id) || []

  const { mechanism } = contract
  const isCpmm = mechanism === 'cpmm-1'
  // TODO: Below hook fetches a decent amount of data. Maybe not worth it to show prob change on hover?
  const { unfilledBets, balanceByUserId } = useUnfilledBetsAndBalanceByUserId(
    contract.id
  )

  const { yesShares, noShares } = useSaveBinaryShares(contract, userBets)

  let sharesSold: number | undefined
  let sellOutcome: 'YES' | 'NO' | undefined
  let saleAmount: number | undefined

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
        ? `${formatMoney(Math.round(saleAmount))} sold of "${shortQ}"...`
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
  const { invested } = getContractBetMetrics(contract, userBets)
  const { hasYesShares, hasNoShares } = useSaveBinaryShares(contract, userBets)
  const hasYesInvestment =
    hasYesShares === true && invested != undefined && floor(invested) > 0
  const hasNoInvestment =
    hasNoShares === true && invested != undefined && floor(invested) > 0

  if (isCpmm && ((upHover && hasNoShares) || (downHover && hasYesShares))) {
    const oppositeShares = upHover ? noShares : yesShares
    if (oppositeShares) {
      sellOutcome = upHover ? 'NO' : 'YES'

      const prob = getProb(contract)
      const maxSharesSold = BET_SIZE / (sellOutcome === 'YES' ? prob : 1 - prob)
      sharesSold = Math.min(oppositeShares, maxSharesSold)
      const probAfterSale = getCpmmProbabilityAfterSale(
        contract,
        sharesSold,
        sellOutcome,
        unfilledBets,
        balanceByUserId
      )

      // Recompute max shares sold using prob after selling.
      // This lower price for your shares means the max is more generous.
      // Which fixes the issue where you sell 99% of your shares instead of all.
      const maxSharesSold2 =
        BET_SIZE / (sellOutcome === 'YES' ? probAfterSale : 1 - probAfterSale)
      sharesSold = Math.min(oppositeShares, maxSharesSold2)

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

  return (
    <div className="relative">
      <Row className={clsx(className, 'absolute inset-0')}>
        <BinaryQuickBetButton
          onClick={() => placeQuickBet('DOWN')}
          direction="DOWN"
          hover={downHover}
          onMouseEnter={() => setDownHover(true)}
          onMouseLeave={() => setDownHover(false)}
          hasInvestment={hasNoInvestment}
          invested={invested}
        />
        <BinaryQuickBetButton
          onClick={() => placeQuickBet('UP')}
          direction="UP"
          hover={upHover}
          onMouseEnter={() => setUpHover(true)}
          onMouseLeave={() => setUpHover(false)}
          hasInvestment={hasYesInvestment}
          invested={invested}
        />
      </Row>
      <QuickOutcomeView contract={contract} previewProb={previewProb} />
    </div>
  )
}

function BinaryQuickBetButton(props: {
  onClick: () => void
  direction: 'UP' | 'DOWN'
  hover: boolean
  onMouseEnter: () => void
  onMouseLeave: () => void
  hasInvestment?: boolean
  invested?: number
}) {
  const {
    onClick,
    direction,
    hover,
    onMouseEnter,
    onMouseLeave,
    hasInvestment,
    invested,
  } = props
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
              ? 'text-indigo-500'
              : 'text-indigo-300'
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
              ? 'text-indigo-500'
              : 'text-indigo-300'
          )}
        />
      )}
      {hasInvestment && invested != null ? (
        <span
          className={clsx(
            'text-sm font-light',
            shouldFocus ? 'text-indigo-600' : 'text-gray-400'
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
  numAnswersFR?: number
}) {
  const { contract, previewProb, numAnswersFR } = props
  const { outcomeType } = contract
  const prob = previewProb ?? getProb(contract)

  const textColor = getTextColor(contract)

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
          className={`absolute inset-0 flex items-center justify-center gap-1 text-lg font-semibold ${textColor}`}
        >
          {cardText(contract, previewProb)}
        </div>
      </div>
    )
  }

  return <ContractCardAnswers contract={contract} numAnswersFR={numAnswersFR} />
}

function cardText(contract: Contract, previewProb?: number) {
  const { resolution, outcomeType, resolutionProbability } = contract

  if (resolution) {
    if (resolution === 'MKT' && resolutionProbability) {
      return (
        <>
          <span className="my-auto text-sm font-normal">resolved as</span>
          {getFormattedMappedValue(contract)(resolutionProbability)}
        </>
      )
    }
    if (resolution === 'CANCEL') {
      return 'CANCELLED'
    }
    return (
      <>
        <span className="text-sm font-normal">resolved</span>
        {resolution}
      </>
    )
  }

  if (previewProb) {
    return getFormattedMappedValue(contract)(previewProb)
  }

  switch (outcomeType) {
    case 'BINARY':
      return getBinaryProbPercent(contract)
    case 'PSEUDO_NUMERIC':
      return formatNumericProbability(getProbability(contract), contract)
    case 'NUMERIC':
      return formatLargeNumber(getExpectedValue(contract))
    // case 'MULTIPLE_CHOICE':
    case 'FREE_RESPONSE': {
      const topAnswer = getTopAnswer(contract)
      return (
        topAnswer &&
        formatPercent(getOutcomeProbability(contract, topAnswer.id))
      )
    }
  }
}

export function ContractCardAnswers(props: {
  contract: FreeResponseContract | MultipleChoiceContract
  numAnswersFR?: number
}) {
  const { contract, numAnswersFR } = props
  const answers = getTopNSortedAnswers(contract, numAnswersFR ?? 3)
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
            type === 'loser' ? 'text-gray-500' : 'text-gray-900'
          )}
          answer={answer}
          truncate="medium"
        />
        <div
          className={clsx(
            'text-md font-semibold',
            type === 'loser' ? 'text-gray-500' : 'text-gray-900'
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
  CANCEL: 'bg-gray-100',
  MKT: 'bg-sky-200',
}

export function getBarColor(contract: Contract) {
  const { resolution } = contract

  if (resolution) {
    return OUTCOME_TO_COLOR_BAR[resolution as resolution] ?? 'bg-indigo-50'
  }

  if ((contract.closeTime ?? Infinity) < Date.now()) {
    return 'bg-slate-200'
  }

  return 'bg-indigo-50'
}

const OUTCOME_TO_COLOR_BACKGROUND = {
  YES: 'bg-teal-100',
  NO: 'bg-scarlet-100',
  CANCEL: 'bg-gray-100',
  MKT: 'bg-sky-100',
}

export function getBgColor(contract: Contract) {
  const { resolution } = contract

  if (resolution) {
    return OUTCOME_TO_COLOR_BACKGROUND[resolution as resolution] ?? 'bg-gray-50'
  }

  // if ((contract.closeTime ?? Infinity) < Date.now()) {
  //   return 'bg-gray-100'
  // }

  return 'bg-gray-50'
}

const OUTCOME_TO_COLOR_TEXT = {
  YES: 'text-teal-600',
  NO: 'text-scarlet-600',
  CANCEL: 'text-gray-400',
  MKT: 'text-sky-600',
}

export function getTextColor(contract: Contract) {
  const { resolution } = contract

  if (resolution) {
    return OUTCOME_TO_COLOR_TEXT[resolution as resolution] ?? 'text-indigo-200'
  }

  if ((contract.closeTime ?? Infinity) < Date.now()) {
    return 'text-gray-600'
  }

  return 'text-gray-900'
}
