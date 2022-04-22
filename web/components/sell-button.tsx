import { Binary, CPMM, DPM, FullContract } from '../../common/contract'
import { User } from '../../common/user'
import { useUserContractBets } from '../hooks/use-user-bets'
import { useState } from 'react'
import { Col } from './layout/col'
import clsx from 'clsx'
import { SellSharesModal } from './sell-modal'

export function SellButton(props: {
  contract: FullContract<DPM | CPMM, Binary>
  user: User | null | undefined
  sharesOutcome: 'YES' | 'NO' | undefined
  shares: number
}) {
  const { contract, user, sharesOutcome, shares } = props
  const userBets = useUserContractBets(user?.id, contract.id)
  const [showSellModal, setShowSellModal] = useState(false)
  const { mechanism } = contract

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
          {'(' + Math.floor(shares) + ' shares)'}
        </div>
        {showSellModal && (
          <SellSharesModal
            contract={contract as FullContract<CPMM, Binary>}
            user={user}
            userBets={userBets ?? []}
            shares={shares}
            sharesOutcome={sharesOutcome}
            setOpen={setShowSellModal}
          />
        )}
      </Col>
    )
  }
  return <div />
}
