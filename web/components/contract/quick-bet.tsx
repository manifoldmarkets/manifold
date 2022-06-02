import clsx from 'clsx'
import {
  getOutcomeProbability,
  getOutcomeProbabilityAfterBet,
  getTopAnswer,
} from 'common/calculate'
import { getExpectedValue } from 'common/calculate-dpm'
import { User } from 'common/user'
import { Contract, NumericContract } from 'common/contract'
import {
  formatLargeNumber,
  formatMoney,
  formatPercent,
} from 'common/util/format'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useUserContractBets } from 'web/hooks/use-user-bets'
import { placeBet } from 'web/lib/firebase/api-call'
import { getBinaryProb, getBinaryProbPercent } from 'web/lib/firebase/contracts'
import TriangleDownFillIcon from 'web/lib/icons/triangle-down-fill-icon'
import TriangleFillIcon from 'web/lib/icons/triangle-fill-icon'
import { Col } from '../layout/col'
import { OUTCOME_TO_COLOR } from '../outcome-label'
import { useSaveShares } from '../use-save-shares'

const BET_SIZE = 10

export function QuickBet(props: { contract: Contract; user: User }) {
  const { contract, user } = props

  const userBets = useUserContractBets(user.id, contract.id)
  const topAnswer =
    contract.outcomeType === 'FREE_RESPONSE'
      ? getTopAnswer(contract)
      : undefined

  // TODO: yes/no from useSaveShares doesn't work on numeric contracts
  const { yesFloorShares, noFloorShares } = useSaveShares(
    contract,
    userBets,
    topAnswer?.number.toString() || undefined
  )
  const hasUpShares =
    yesFloorShares || (noFloorShares && contract.outcomeType === 'NUMERIC')
  const hasDownShares =
    noFloorShares && yesFloorShares <= 0 && contract.outcomeType !== 'NUMERIC'

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

  async function placeQuickBet(direction: 'UP' | 'DOWN') {
    const betPromise = async () => {
      const outcome = quickOutcome(contract, direction)
      return await placeBet({
        amount: BET_SIZE,
        outcome,
        contractId: contract.id,
      })
    }
    const shortQ = contract.question.slice(0, 20)
    toast.promise(betPromise(), {
      loading: `${formatMoney(BET_SIZE)} on "${shortQ}"...`,
      success: `${formatMoney(BET_SIZE)} on "${shortQ}"...`,
      error: (err) => `${err.message}`,
    })
  }

  function quickOutcome(contract: Contract, direction: 'UP' | 'DOWN') {
    if (contract.outcomeType === 'BINARY') {
      return direction === 'UP' ? 'YES' : 'NO'
    }
    if (contract.outcomeType === 'FREE_RESPONSE') {
      // TODO: Implement shorting of free response answers
      if (direction === 'DOWN') {
        throw new Error("Can't bet against free response answers")
      }
      return getTopAnswer(contract)?.id
    }
    if (contract.outcomeType === 'NUMERIC') {
      // TODO: Ideally an 'UP' bet would be a uniform bet between [current, max]
      throw new Error("Can't quick bet on numeric markets")
    }
  }

  const textColor = `text-${getColor(contract, previewProb)}`

  return (
    <Col
      className={clsx(
        'relative -my-4 -mr-5 min-w-[5.5rem] justify-center gap-2 pr-5 pl-1 align-middle'
        // Use this for colored QuickBet panes
        // `bg-opacity-10 bg-${color}`
      )}
    >
      {/* Up bet triangle */}
      <div>
        <div
          className="peer absolute top-0 left-0 right-0 h-[50%]"
          onMouseEnter={() => setUpHover(true)}
          onMouseLeave={() => setUpHover(false)}
          onClick={() => placeQuickBet('UP')}
        />
        <div className="mt-2 text-center text-xs text-transparent peer-hover:text-gray-400">
          {formatMoney(10)}
        </div>

        {hasUpShares > 0 ? (
          <TriangleFillIcon
            className={clsx(
              'mx-auto h-5 w-5',
              upHover ? textColor : 'text-gray-400'
            )}
          />
        ) : (
          <TriangleFillIcon
            className={clsx(
              'mx-auto h-5 w-5',
              upHover ? textColor : 'text-gray-200'
            )}
          />
        )}
      </div>

      <QuickOutcomeView contract={contract} previewProb={previewProb} />

      {/* Down bet triangle */}
      {contract.outcomeType !== 'BINARY' ? (
        <div>
          <div className="peer absolute bottom-0 left-0 right-0 h-[50%] cursor-default"></div>
          <TriangleDownFillIcon
            className={clsx('mx-auto h-5 w-5 text-gray-200')}
          />
        </div>
      ) : (
        <div>
          <div
            className="peer absolute bottom-0 left-0 right-0 h-[50%]"
            onMouseEnter={() => setDownHover(true)}
            onMouseLeave={() => setDownHover(false)}
            onClick={() => placeQuickBet('DOWN')}
          ></div>
          {hasDownShares > 0 ? (
            <TriangleDownFillIcon
              className={clsx(
                'mx-auto h-5 w-5',
                downHover ? 'text-red-500' : 'text-gray-400'
              )}
            />
          ) : (
            <TriangleDownFillIcon
              className={clsx(
                'mx-auto h-5 w-5',
                downHover ? 'text-red-500' : 'text-gray-200'
              )}
            />
          )}
          <div className="mb-2 text-center text-xs text-transparent peer-hover:text-gray-400">
            {formatMoney(10)}
          </div>
        </div>
      )}
    </Col>
  )
}

export function ProbBar(props: { contract: Contract; previewProb?: number }) {
  const { contract, previewProb } = props
  const color = getColor(contract, previewProb)
  const prob = previewProb ?? getProb(contract)
  return (
    <>
      <div
        className={clsx(
          'absolute right-0 top-0 w-1 rounded-tr-md transition-all',
          'bg-gray-100'
        )}
        style={{ height: `${100 * (1 - prob)}%` }}
      />
      <div
        className={clsx(
          'absolute right-0 bottom-0 w-1 rounded-br-md transition-all',
          `bg-${color}`,
          // If we're showing the full bar, also round the top
          prob === 1 ? 'rounded-tr-md' : ''
        )}
        style={{ height: `${100 * prob}%` }}
      />
    </>
  )
}

function QuickOutcomeView(props: {
  contract: Contract
  previewProb?: number
  caption?: 'chance' | 'expected'
}) {
  const { contract, previewProb, caption } = props
  const { outcomeType } = contract
  // If there's a preview prob, display that instead of the current prob
  const override =
    previewProb === undefined ? undefined : formatPercent(previewProb)
  const textColor = `text-${getColor(contract, previewProb)}`

  let display: string | undefined
  switch (outcomeType) {
    case 'BINARY':
      display = getBinaryProbPercent(contract)
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
    <Col className={clsx('items-center text-3xl', textColor)}>
      {override ?? display}
      {caption && <div className="text-base">{caption}</div>}
      <ProbBar contract={contract} previewProb={previewProb} />
    </Col>
  )
}

// Return a number from 0 to 1 for this contract
// Resolved contracts are set to 1, for coloring purposes (even if NO)
function getProb(contract: Contract) {
  const { outcomeType, resolution } = contract
  return resolution
    ? 1
    : outcomeType === 'BINARY'
    ? getBinaryProb(contract)
    : outcomeType === 'FREE_RESPONSE'
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

export function getColor(contract: Contract, previewProb?: number) {
  // TODO: Try injecting a gradient here
  // return 'primary'
  const { resolution } = contract
  if (resolution) {
    return (
      OUTCOME_TO_COLOR[resolution as 'YES' | 'NO' | 'CANCEL' | 'MKT'] ??
      // If resolved to a FR answer, use 'primary'
      'primary'
    )
  }

  if (contract.outcomeType === 'NUMERIC') {
    return 'blue-400'
  }

  if (contract.outcomeType === 'FREE_RESPONSE') {
    return 'blue-400'
  }

  if ((contract.closeTime ?? Infinity) < Date.now()) {
    return 'gray-400'
  }

  // TODO: Not sure why eg green-400 doesn't work here; try upgrading Tailwind
  return 'primary'
}
