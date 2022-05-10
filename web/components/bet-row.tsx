import { useState } from 'react'
import clsx from 'clsx'

import { BetPanelSwitcher } from './bet-panel'
import { Row } from './layout/row'
import { YesNoSelector } from './yes-no-selector'
import { Binary, CPMM, DPM, FullContract } from 'common/contract'
import { Modal } from './layout/modal'
import { SellButton } from './sell-button'
import { useUser } from 'web/hooks/use-user'
import { useUserContractBets } from 'web/hooks/use-user-bets'
import { useSaveShares } from './use-save-shares'

// Inline version of a bet panel. Opens BetPanel in a new modal.
export default function BetRow(props: {
  contract: FullContract<DPM | CPMM, Binary>
  className?: string
  btnClassName?: string
}) {
  const { className, btnClassName, contract } = props
  const [open, setOpen] = useState(false)
  const [betChoice, setBetChoice] = useState<'YES' | 'NO' | undefined>(
    undefined
  )
  const user = useUser()
  const userBets = useUserContractBets(user?.id, contract.id)
  const { yesFloorShares, noFloorShares, yesShares, noShares } = useSaveShares(
    contract,
    userBets
  )

  return (
    <>
      <YesNoSelector
        className={clsx('mt-2 justify-end', className)}
        btnClassName={clsx('btn-sm w-24', btnClassName)}
        onSelect={(choice) => {
          setOpen(true)
          setBetChoice(choice)
        }}
        replaceNoButton={
          yesFloorShares > 0 ? (
            <SellButton
              contract={contract}
              user={user}
              sharesOutcome={'YES'}
              shares={yesShares}
            />
          ) : undefined
        }
        replaceYesButton={
          noFloorShares > 0 ? (
            <SellButton
              contract={contract}
              user={user}
              sharesOutcome={'NO'}
              shares={noShares}
            />
          ) : undefined
        }
      />
      <Modal open={open} setOpen={setOpen}>
        <BetPanelSwitcher
          contract={contract}
          title={contract.question}
          selected={betChoice}
          onBetSuccess={() => setOpen(false)}
        />
      </Modal>
    </>
  )
}
