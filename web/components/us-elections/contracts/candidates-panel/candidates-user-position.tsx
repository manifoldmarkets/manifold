import clsx from 'clsx'
import { Answer } from 'common/answer'
import { Bet } from 'common/bet'
import { BinaryContract, CPMMMultiContract } from 'common/contract'
import { TRADED_TERM } from 'common/envs/constants'
import { User } from 'common/user'
import { sumBy } from 'lodash'
import { useState } from 'react'
import { SellSharesModal } from 'web/components/bet/sell-row'
import { useSavedContractMetrics } from 'web/hooks/use-saved-contract-metrics'

export function UserPosition(props: {
  contract: CPMMMultiContract
  userBets: Bet[]
  answer: Answer
  user: User
  className?: string
  greenArrowClassName?: string
  redArrowClassName?: string
}) {
  const {
    contract,
    user,
    userBets,
    answer,
    className,
    greenArrowClassName,
    redArrowClassName,
  } = props

  const metric = useSavedContractMetrics(contract, answer.id)
  const { totalShares } = metric ?? { totalShares: { YES: 0, NO: 0 } }
  const yesWinnings = totalShares.YES ?? 0
  const noWinnings = totalShares.NO ?? 0
  const position = yesWinnings - noWinnings
  const betUp = position > 1e-7
  const betDown = position < 1e-7
  const sharesSum = sumBy(userBets, (bet) =>
    bet.outcome === 'YES' ? bet.shares : -bet.shares
  )
  const [openModal, setOpenModal] = useState(false)
  if (!betUp && !betDown) {
    return <></>
  }

  console.log(contract.question, answer.text, metric)

  return (
    <button
      className={clsx(className)}
      onClick={(e) => {
        e.stopPropagation()
        if (
          (!contract.closeTime || contract.closeTime > Date.now()) &&
          !answer.resolutionTime
        ) {
          setOpenModal(true)
        }
      }}
    >
      <span className="mx-auto items-center gap-1 whitespace-nowrap">
        You {TRADED_TERM}{' '}
        {betUp ? (
          <span
            className={clsx(
              'font-semibold text-teal-400 dark:text-teal-600',
              greenArrowClassName
            )}
          >
            YES
          </span>
        ) : (
          <span
            className={clsx(
              'text-scarlet-400 dark:text-scarlet-600 font-semibold',
              redArrowClassName
            )}
          >
            NO
          </span>
        )}
      </span>
      {openModal && (
        <>
          <SellSharesModal
            contract={contract}
            user={user}
            metric={metric}
            shares={Math.abs(sharesSum)}
            sharesOutcome={sharesSum > 0 ? 'YES' : 'NO'}
            setOpen={setOpenModal}
            answerId={answer.id}
          />
        </>
      )}
    </button>
  )
}

export function BinaryUserPosition(props: {
  contract: BinaryContract
  userBets: Bet[]
  user: User
  className?: string
  binaryPseudonym?: {
    YES: {
      pseudonymName: string
      pseudonymColor: string
    }
    NO: {
      pseudonymName: string
      pseudonymColor: string
    }
  }
}) {
  const { contract, user, userBets, className, binaryPseudonym } = props

  const metric = useSavedContractMetrics(contract)
  const { totalShares } = metric ?? { totalShares: { YES: 0, NO: 0 } }
  const yesWinnings = totalShares.YES
  const noWinnings = totalShares.NO
  const position = yesWinnings - noWinnings
  const betUp = position > 1e-7
  const betDown = position < 1e-7
  const sharesSum = sumBy(userBets, (bet) =>
    bet.outcome === 'YES' ? bet.shares : -bet.shares
  )
  const [openModal, setOpenModal] = useState(false)
  if (!betUp && !betDown) {
    return <></>
  }

  return (
    <button
      className={clsx(className)}
      onClick={(e) => {
        e.stopPropagation()
        if (
          (!contract.closeTime || contract.closeTime > Date.now()) &&
          !contract.resolution
        ) {
          setOpenModal(true)
        }
      }}
    >
      <span className="mx-auto items-center gap-1 whitespace-nowrap">
        You {TRADED_TERM} <span className={clsx('font-semibold ')}>UP</span>
      </span>
      {openModal && (
        <>
          <SellSharesModal
            contract={contract}
            user={user}
            metric={metric}
            shares={Math.abs(sharesSum)}
            sharesOutcome={sharesSum > 0 ? 'YES' : 'NO'}
            setOpen={setOpenModal}
            binaryPseudonym={binaryPseudonym}
          />
        </>
      )}
    </button>
  )
}
