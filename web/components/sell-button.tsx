import { Binary, CPMM, DPM, FullContract } from '../../common/contract'
import { User } from '../../common/user'
import { useUserContractBets } from '../hooks/use-user-bets'
import { useState } from 'react'
import { useSaveShares } from './use-save-shares'
import { Col } from './layout/col'
import clsx from 'clsx'
import { SellSharesModal } from './sell-modal'

export function SellButton(props: {
  contract: FullContract<DPM | CPMM, Binary>
  user: User | null | undefined
}) {
  const { contract, user } = props

  const userBets = useUserContractBets(user?.id, contract.id)
  const [showSellModal, setShowSellModal] = useState(false)

  const { mechanism } = contract
  const { yesFloorShares, noFloorShares, yesShares, noShares } = useSaveShares(
    contract,
    userBets
  )
  const floorShares = yesFloorShares || noFloorShares
  const sharesOutcome = yesFloorShares
    ? 'YES'
    : noFloorShares
    ? 'NO'
    : undefined

  if (sharesOutcome && user && mechanism === 'cpmm-1') {
    return (
      <Col className={'items-center'}>
        <button
          className={clsx(
            'btn-sm w-24 gap-1',
            // from the yes-no-selector:
            'flex inline-flex flex-row  items-center justify-center rounded-3xl border-2 p-2',
            sharesOutcome === 'NO'
              ? 'hover:bg-primary-focus border-primary hover:border-primary-focus text-primary hover:text-white'
              : 'border-red-400 text-red-500 hover:border-red-500 hover:bg-red-500 hover:text-white'
          )}
          onClick={() => setShowSellModal(true)}
        >
          {'Sell ' + sharesOutcome}
        </button>
        <div className={'mt-1 w-24 text-center text-sm text-gray-500'}>
          {'(' + floorShares + ' shares)'}
        </div>
        {showSellModal && (
          <SellSharesModal
            contract={contract as FullContract<CPMM, Binary>}
            user={user}
            userBets={userBets ?? []}
            shares={yesShares || noShares}
            sharesOutcome={sharesOutcome}
            setOpen={setShowSellModal}
          />
        )}
      </Col>
    )
  }
  return <div />
}
