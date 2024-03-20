import clsx from 'clsx'
import { Answer } from 'common/answer'
import { Bet } from 'common/bet'
import { getContractBetMetrics } from 'common/calculate'
import { CPMMMultiContract } from 'common/contract'
import { User } from 'common/user'
import { useState } from 'react'
import { SellSharesModal } from 'web/components/bet/sell-row'
import { Row } from 'web/components/layout/row'
import { sumBy } from 'lodash'
import { FaArrowDown, FaArrowUp } from 'react-icons/fa'

export function UserCandidatePosition(props: {
  contract: CPMMMultiContract
  userBets: Bet[]
  answer: Answer
  user: User
  className?: string
}) {
  const { contract, user, userBets, answer, className } = props

  const { invested, totalShares } = getContractBetMetrics(contract, userBets)

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

  return (
    <button
      className={clsx(
        className,
        'bg-ink-700/80 hover:bg-ink-700 hover:dark:bg-ink-200 dark:bg-ink-200/80 absolute bottom-0 left-0 right-0 z-20 flex flex-row gap-1.5 whitespace-nowrap px-2 py-1 text-xs text-white transition-opacity'
      )}
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
      <Row className="mx-auto items-center gap-1">
        {betUp ? (
          <FaArrowUp className="h-3 w-3 text-teal-400 dark:text-teal-600" />
        ) : (
          <FaArrowDown className="text-scarlet-400 dark:text-scarlet-600 h-3 w-3" />
        )}
        You bet {betUp ? 'up' : 'down'}
      </Row>
      {openModal && (
        <>
          <SellSharesModal
            contract={contract}
            user={user}
            userBets={userBets}
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
