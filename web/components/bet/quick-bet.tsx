import clsx from 'clsx'
import {
  getOutcomeProbability,
  getOutcomeProbabilityAfterBet,
  getProbability,
  getTopAnswer,
  getTopNSortedAnswers,
  getInvested,
} from 'common/calculate'
import { getExpectedValue } from 'common/calculate-dpm'
import { User } from 'common/user'
import {
  BinaryContract,
  Contract,
  MultiContract,
  NumericContract,
  PseudoNumericContract,
  resolution,
  StonkContract,
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
import { getBinaryProbPercent } from 'common/contract'
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
import { Row } from '../layout/row'
import { Col } from '../layout/col'
import { Answer, DpmAnswer } from 'common/answer'
import { AnswerLabel } from '../outcome-label'
import { useChartAnswers } from '../charts/contract/choice'
import { getAnswerColor } from '../answers/answers-panel'
import EquilateralLeftTriangle from 'web/lib/icons/equilateral-left-triangle'
import EquilateralRightTriangle from 'web/lib/icons/equilateral-right-triangle'
import { floor } from 'lodash'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { firebaseLogin } from 'web/lib/firebase/users'
import { ENV_CONFIG } from 'common/envs/constants'

const BET_SIZE = 10

export function QuickBet(props: {
  contract: BinaryContract | PseudoNumericContract | StonkContract
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
  contract: BinaryContract | PseudoNumericContract | StonkContract
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
      <Row className={clsx(className, 'absolute inset-0 justify-between')}>
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
  contract: BinaryContract | PseudoNumericContract | StonkContract
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
        ? `Sold ${formatMoney(
            Math.round(saleAmount)
          )} ${sellOutcome} of "${shortQ}"...`
        : `Bet ${formatMoney(BET_SIZE)} ${
            direction === 'UP' ? 'YES' : 'NO'
          } on "${shortQ}"...`

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
  const invested = getInvested(contract, userBets)
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
      <Row className={clsx(className, 'absolute inset-0 justify-between')}>
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
  className?: string
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
        'items-center gap-2 sm:w-[50%]',
        direction === 'UP' && 'flex-row-reverse'
      )}
    >
      <Row
        className={clsx(
          'items-center gap-2 sm:w-full',
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
                ? 'animate-bounce-left text-primary-600'
                : hasInvestment
                ? 'text-primary-500'
                : 'text-primary-300'
            )}
          />
        )}
        {direction === 'UP' && (
          <EquilateralRightTriangle
            className={clsx(
              'mx-2 h-6 w-6 drop-shadow-md transition-all',
              shouldFocus
                ? 'sm:animate-bounce-right text-primary-600'
                : hasInvestment
                ? 'text-primary-500'
                : 'text-primary-300'
            )}
          />
        )}
        {!isMobile && (
          <QuickBetAmount
            hasInvestment={hasInvestment}
            invested={invested}
            shouldFocus={shouldFocus}
            isYes={direction === 'UP'}
          />
        )}
      </Row>
      {isMobile && (
        <QuickBetAmount
          hasInvestment={hasInvestment}
          invested={invested}
          shouldFocus={shouldFocus}
          isYes={direction === 'UP'}
        />
      )}
    </Row>
  )
}

function QuickBetAmount(props: {
  hasInvestment: boolean | undefined
  invested: number | undefined
  shouldFocus: boolean
  isYes?: boolean
}) {
  const { shouldFocus, isYes } = props

  return (
    <span
      className={clsx(
        'text-primary-600 font my-auto text-sm transition-opacity',
        shouldFocus ? 'opacity-100' : 'opacity-0'
      )}
    >
      Bet {formatMoney(BET_SIZE)} {isYes ? 'YES' : 'NO'}
    </span>
  )
}

function quickOutcome(contract: Contract, direction: 'UP' | 'DOWN') {
  const { outcomeType } = contract

  if (
    outcomeType === 'BINARY' ||
    outcomeType === 'PSEUDO_NUMERIC' ||
    outcomeType === 'STONK'
  ) {
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
  const isMobile = useIsMobile()
  const prob = isMobile ? getProb(contract) : previewProb ?? getProb(contract)
  const textColor = getTextColor(contract)

  if (
    outcomeType == 'BINARY' ||
    outcomeType == 'NUMERIC' ||
    outcomeType == 'PSEUDO_NUMERIC' ||
    outcomeType == 'STONK'
  ) {
    return (
      <div
        className={clsx(
          'relative h-8 w-full overflow-hidden rounded-md',
          getBgColor(contract)
        )}
      >
        <div
          className={clsx(
            'h-full rounded-r-md transition-all',
            getBarColor(contract)
          )}
          style={{ width: `${100 * prob}%` }}
          aria-hidden
        />
        <div
          className={`absolute inset-0 flex items-center justify-center gap-1 text-lg font-semibold ${textColor}`}
        >
          {outcomeType === 'STONK' ? ENV_CONFIG.moneyMoniker : ''}
          {cardText(contract, isMobile ? undefined : previewProb)}
        </div>
      </div>
    )
  }

  if (outcomeType == 'FREE_RESPONSE' || outcomeType == 'MULTIPLE_CHOICE') {
    return (
      <ContractCardAnswers contract={contract} numAnswersFR={numAnswersFR} />
    )
  }

  // cert
  return <></>
}

function cardText(contract: Contract, previewProb?: number) {
  const { resolution, outcomeType, resolutionProbability } = contract

  if (resolution) {
    if (resolution === 'MKT' && resolutionProbability) {
      return (
        <>
          <span className="my-auto text-sm font-normal">resolved as</span>
          {getFormattedMappedValue(contract, resolutionProbability)}
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
    return getFormattedMappedValue(contract, previewProb)
  }

  switch (outcomeType) {
    case 'BINARY':
      return getBinaryProbPercent(contract)
    case 'STONK':
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
  contract: MultiContract
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
    <Col className="w-full gap-2">
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
  answer: Answer | DpmAnswer,
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
  contract: MultiContract
  answer: Answer | DpmAnswer
  answersArray: string[]
  type: 'winner' | 'loser' | 'contender'
}) {
  const { contract, answer, answersArray, type } = props
  const prob = getOutcomeProbability(contract, answer.id)
  const display = formatPercent(getOutcomeProbability(contract, answer.id))
  const isClosed = (contract.closeTime ?? Infinity) < Date.now()
  const answerColor = getAnswerColor(answer, answersArray)
  const color =
    type === 'loser' || (isClosed && type === 'contender')
      ? '#D8D8EB80'
      : answerColor
  return (
    <div
      className={clsx(
        'bg-ink-100 relative h-7 overflow-hidden rounded-md',
        type === 'winner' && 'ring-[1.5px] ring-purple-500'
      )}
    >
      <div
        className={'h-full rounded-r-md transition-all'}
        style={{
          backgroundColor: color,
          width: `${100 * prob}%`,
        }}
      />
      <span
        className={clsx(
          'text-md',
          type === 'loser' ? 'text-ink-600' : 'text-ink-900',
          'absolute inset-0 flex items-center justify-between px-4'
        )}
      >
        <AnswerLabel answer={answer} truncate={'short'} />
        <div className="font-semibold">{display}</div>
      </span>
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
    : outcomeType === 'BINARY' ||
      outcomeType === 'PSEUDO_NUMERIC' ||
      outcomeType === 'STONK'
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
  CANCEL: 'bg-ink-200',
  MKT: 'bg-sky-200',
}

export function getBarColor(contract: Contract) {
  const { resolution } = contract

  if (resolution) {
    return OUTCOME_TO_COLOR_BAR[resolution as resolution] ?? 'bg-primary-100'
  }

  if ((contract.closeTime ?? Infinity) < Date.now()) {
    return 'bg-ink-200'
  }

  return 'bg-primary-100'
}

const OUTCOME_TO_COLOR_BACKGROUND = {
  YES: 'bg-teal-100',
  NO: 'bg-scarlet-100',
  CANCEL: 'bg-ink-100',
  MKT: 'bg-sky-100',
}

export function getBgColor(contract: Contract) {
  const { resolution } = contract

  if (resolution) {
    return OUTCOME_TO_COLOR_BACKGROUND[resolution as resolution] ?? 'bg-ink-100'
  }

  return 'bg-ink-100'
}

const OUTCOME_TO_COLOR_TEXT = {
  YES: 'text-teal-600',
  NO: 'text-scarlet-600',
  CANCEL: 'text-ink-400',
  MKT: 'text-sky-600',
}

export function getTextColor(contract: Contract) {
  const { resolution } = contract

  if (resolution) {
    return OUTCOME_TO_COLOR_TEXT[resolution as resolution] ?? 'text-primary-200'
  }
  if ((contract.closeTime ?? Infinity) < Date.now()) {
    return 'text-ink-600'
  }

  return 'text-ink-900'
}
