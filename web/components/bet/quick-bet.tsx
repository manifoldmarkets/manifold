import clsx from 'clsx'
import {
  getOutcomeProbability,
  getOutcomeProbabilityAfterBet,
  getProbability,
  getTopAnswer,
} from 'common/calculate'
import { getExpectedValue } from 'common/calculate-dpm'
import { User } from 'common/user'
import {
  BinaryContract,
  Contract,
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
import TriangleLeftFillIcon from 'web/lib/icons/triangle-left-fill-icon'
import TriangleRightFillIcon from 'web/lib/icons/triangle-right-fill-icon'
import { useSaveBinaryShares } from '../../hooks/use-save-binary-shares'
import { sellShares } from 'web/lib/firebase/api'
import { calculateCpmmSale, getCpmmProbability } from 'common/calculate-cpmm'
import { track } from 'web/lib/service/analytics'
import { formatNumericProbability } from 'common/pseudo-numeric'
import { useUnfilledBetsAndBalanceByUserId } from 'web/hooks/use-bets'
import { getBinaryProb } from 'common/contract-details'
import { Row } from '../layout/row'
import { FreeResponseTopAnswer } from '../contract/contract-card'

const BET_SIZE = 10

export function QuickBet(props: {
  contract: BinaryContract | PseudoNumericContract
  user: User
  className?: string
}) {
  const { contract, user, className } = props
  const { mechanism, outcomeType } = contract
  const isCpmm = mechanism === 'cpmm-1'

  const userBets = useUserContractBets(user.id, contract.id)
  // TODO: Below hook fetches a decent amount of data. Maybe not worth it to show prob change on hover?
  const { unfilledBets, balanceByUserId } = useUnfilledBetsAndBalanceByUserId(
    contract.id
  )

  const { yesShares, noShares } = useSaveBinaryShares(contract, userBets)

  const [upHover, setUpHover] = useState(false)
  const [downHover, setDownHover] = useState(false)
  const textColor = `text-${getTextColor(contract)}`

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
    <Row
      className={clsx(
        className,
        'relative min-w-[5.5rem]  items-center justify-between   align-middle'
        // Use this for colored QuickBet panes
        // `bg-opacity-10 bg-${color}`
      )}
    >
      {/* Up bet triangle */}
      <div>
        <div
          className="peer absolute bottom-0 top-0 left-0 w-[50%]"
          onMouseEnter={() => setDownHover(true)}
          onMouseLeave={() => setDownHover(false)}
          onClick={() => placeQuickBet('DOWN')}
        ></div>

        <Row className=" flex items-center text-gray-500">
          <TriangleLeftFillIcon
            className={clsx(
              'mx-auto h-6 w-6',
              downHover ? 'text-red-400' : 'text-indigo-500'
            )}
          />
          <span className={textColor}>NO </span>
        </Row>
      </div>

      <QuickOutcomeView contract={contract} previewProb={previewProb} />

      {/* Down bet triangle */}
      {outcomeType !== 'BINARY' && outcomeType !== 'PSEUDO_NUMERIC' ? (
        <div>
          <div className="peer absolute bottom-0 left-0 right-0 h-[50%] cursor-default"></div>
          <TriangleLeftFillIcon
            className={clsx('mx-auto h-6 w-6 text-gray-200')}
          />
        </div>
      ) : (
        <div>
          <div
            className="peer absolute top-0 bottom-0 right-0 w-[50%]"
            onMouseEnter={() => setUpHover(true)}
            onMouseLeave={() => setUpHover(false)}
            onClick={() => placeQuickBet('UP')}
          />

          <Row className=" flex items-center text-gray-500">
            <span className={textColor}>YES </span>
            <TriangleRightFillIcon
              className={clsx(
                'mx-auto h-6 w-6',
                upHover ? 'text-green-400' : 'text-indigo-500'
              )}
            />
          </Row>
        </div>
      )}
    </Row>
  )
}

export function ProbBar(props: { contract: Contract; previewProb?: number }) {
  const { contract, previewProb } = props
  const [filledColor, unfilledColor] = getProbBarColors(contract)
  const prob = previewProb ?? getProb(contract)
  return (
    <>
      <div
        className={clsx(
          'absolute right-0 bottom-0 top-0 -z-10 w-1.5 transition-all',
          `bg-${unfilledColor}`
        )}
        style={{ width: `${100 * (1 - prob)}%` }}
      />
      <div
        className={clsx(
          ' absolute left-0 bottom-0 top-0 -z-10 w-1.5 transition-all',
          `bg-${filledColor}`,
          // If we're showing the full bar, also round the top
          prob === 1 ? 'rounded-tr-md' : ''
        )}
        style={{ width: `${100 * prob}%` }}
      />
    </>
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

  // If there's a preview prob, display that instead of the current prob
  const override =
    previewProb === undefined
      ? undefined
      : isPseudoNumeric
      ? formatNumericProbability(previewProb, contract)
      : formatPercent(previewProb)

  const textColor = `text-${getTextColor(contract)}`

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

  return (
    <Row
      className={clsx(
        'items-center justify-center gap-2 py-1 text-xl',
        textColor
      )}
    >
      {outcomeType == 'FREE_RESPONSE' && (
        <>
          <FreeResponseTopAnswer contract={contract} className="text-xs" />
          {override ?? display}
        </>
      )}
      {outcomeType != 'FREE_RESPONSE' &&
        (contract.resolution ?? override ?? display)}
      {caption && <div className="text-base">{caption}</div>}
      <ProbBar contract={contract} previewProb={previewProb} />
    </Row>
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

const OUTCOME_TO_COLOR = {
  YES: 'teal',
  NO: 'scarlet',
  CANCEL: 'yellow',
  MKT: 'blue',
}

export function getColor(contract: Contract) {
  const { resolution } = contract

  if (resolution) {
    return OUTCOME_TO_COLOR[resolution as resolution] ?? 'indigo'
  }

  if ((contract.closeTime ?? Infinity) < Date.now()) {
    return 'gray'
  }

  return 'indigo'
}

export function getTextColor(contract: Contract) {
  // this is a bit of a hack, for some reason some tailwind color classes don't work
  // so im working around it
  const color = getColor(contract)
  if (color) {
    switch (color) {
      case 'teal':
      case 'blue':
        return `${color}-500`
      case 'yellow':
        return 'yellow-700'
      default:
        return `${color}-600`
    }
  }
}

export function getProbBarColors(contract: Contract): [string, string] {
  const color = getColor(contract)

  if (color) {
    switch (color) {
      case 'teal':
        return [`${color}-100`, `${color}-50`]
      case 'scarlet':
        return [`${color}-300`, `${color}-50`]
      case 'yellow':
        return [`${color}-400`, `${color}-50`]
      case 'blue':
        return [`${color}-100`, `${color}-50`]
      case 'indigo':
        return [`${color}-200`, `${color}-50`]
      case 'gray':
        return [`${color}-200`, `${color}-50`]
      default:
        return [`${color}-400`, `${color}-50`]
    }
  }
  return ['indigo-400', 'indigo-50']
}
