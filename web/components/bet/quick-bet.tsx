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
import { Tooltip } from '../widgets/tooltip'

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
    <div className="mx-y relative">
      <Row
        className={clsx(
          className,
          'absolute my-auto mt-0.5 w-full items-center justify-between align-middle'
        )}
      >
        <Row
          className="items-center pr-4"
          onMouseEnter={() => setDownHover(true)}
          onMouseLeave={() => setDownHover(false)}
          onClick={() => placeQuickBet('DOWN')}
        >
          <TriangleLeftFillIcon
            className={clsx(
              'mx-auto h-6 w-6',
              downHover ? 'text-indigo-700' : 'text-indigo-500'
            )}
          />
          <span
            className={clsx(
              'text-sm font-light text-indigo-500 transition-opacity',
              downHover ? 'opacity-100' : 'opacity-0 '
            )}
          >
            M$10
          </span>
        </Row>
        <Row
          className="items-center pl-4"
          onMouseEnter={() => setUpHover(true)}
          onMouseLeave={() => setUpHover(false)}
          onClick={() => placeQuickBet('UP')}
        >
          <span
            className={clsx(
              'transition- text-sm font-light text-indigo-500',
              upHover ? 'opacity-100' : 'opacity-0 '
            )}
          >
            M$10
          </span>
          <TriangleRightFillIcon
            className={clsx(
              'mx-auto h-6 w-6',
              upHover ? 'text-indigo-700' : 'text-indigo-500'
            )}
          />
        </Row>
      </Row>
      <QuickOutcomeView contract={contract} previewProb={previewProb} />
    </div>
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
  return (
    <Row
      className="justify-between rounded-md px-4 py-0.5 transition-all"
      style={{
        background: `linear-gradient(to right, ${getBarColor(contract)} ${
          100 * prob
        }%, ${getBgColor(contract)} ${100 * prob}%)`,
      }}
    >
      {outcomeType != 'FREE_RESPONSE' && (
        <div className={`mx-auto font-semibold ${textColor}`}>
          {contract.resolution ?? override ?? display}
        </div>
      )}
      {outcomeType === 'FREE_RESPONSE' && (
        <>
          <FreeResponseTopAnswer contract={contract} className="text-xs" />
          <div className={`font-semibold ${textColor}`}>
            {override ?? display}
          </div>
        </>
      )}
      {caption && <div className="text-base">{caption}</div>}
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
  MKT: '#e0f2fe',
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
