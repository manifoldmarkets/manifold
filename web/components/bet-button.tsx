import { useState } from 'react'
import clsx from 'clsx'

import { SimpleBetPanel } from './bet-panel'
import { CPMMBinaryContract, PseudoNumericContract } from 'common/contract'
import { Modal } from './layout/modal'
import { useUser } from 'web/hooks/use-user'
import { useUserContractBets } from 'web/hooks/use-user-bets'
import { useSaveBinaryShares } from './use-save-binary-shares'
import { Col } from './layout/col'

/** Button that opens BetPanel in a new modal */
export default function BetButton(props: {
  contract: CPMMBinaryContract | PseudoNumericContract
  className?: string
  btnClassName?: string
  betPanelClassName?: string
}) {
  const { className, btnClassName, betPanelClassName, contract } = props
  const [open, setOpen] = useState(false)

  const user = useUser()
  const userBets = useUserContractBets(user?.id, contract.id)
  const { yesShares, noShares, hasYesShares, hasNoShares } =
    useSaveBinaryShares(contract, userBets)

  const { outcomeType } = contract
  const isPseudoNumeric = outcomeType === 'PSEUDO_NUMERIC'

  return (
    <>
      <Col className={clsx('items-center', className)}>
        <button
          className={clsx(
            'btn btn-lg btn-outline my-auto inline-flex h-10 min-h-0 w-24',
            btnClassName
          )}
          onClick={() => setOpen(true)}
        >
          Bet
        </button>

        <div className={'mt-1 w-24 text-center text-sm text-gray-500'}>
          {hasYesShares
            ? `(${Math.floor(yesShares)} ${isPseudoNumeric ? 'HIGHER' : 'YES'})`
            : hasNoShares
            ? `(${Math.floor(noShares)} ${isPseudoNumeric ? 'LOWER' : 'NO'})`
            : ''}
        </div>
      </Col>

      <Modal open={open} setOpen={setOpen}>
        <SimpleBetPanel
          className={betPanelClassName}
          contract={contract}
          selected="YES"
          onBetSuccess={() => setOpen(false)}
          hasShares={hasYesShares || hasNoShares}
        />
      </Modal>
    </>
  )
}
