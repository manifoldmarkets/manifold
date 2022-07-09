import { useState } from 'react'
import clsx from 'clsx'

import { SimpleBetPanel } from './bet-panel'
import { YesNoSelector } from './yes-no-selector'
import { CPMMBinaryContract, PseudoNumericContract } from 'common/contract'
import { Modal } from './layout/modal'
import { SellButton } from './sell-button'
import { useUser } from 'web/hooks/use-user'
import { useUserContractBets } from 'web/hooks/use-user-bets'
import { useSaveBinaryShares } from './use-save-binary-shares'

// Inline version of a bet panel. Opens BetPanel in a new modal.
export default function BetRow(props: {
  contract: CPMMBinaryContract | PseudoNumericContract
  className?: string
  btnClassName?: string
  betPanelClassName?: string
}) {
  const { className, btnClassName, betPanelClassName, contract } = props
  const [open, setOpen] = useState(false)
  const [betChoice, setBetChoice] = useState<'YES' | 'NO' | undefined>(
    undefined
  )
  const user = useUser()
  const userBets = useUserContractBets(user?.id, contract.id)
  const { yesShares, noShares, hasYesShares, hasNoShares } =
    useSaveBinaryShares(contract, userBets)

  return (
    <>
      <YesNoSelector
        isPseudoNumeric={contract.outcomeType === 'PSEUDO_NUMERIC'}
        className={clsx('justify-end', className)}
        btnClassName={clsx('btn-sm w-24', btnClassName)}
        onSelect={(choice) => {
          setOpen(true)
          setBetChoice(choice)
        }}
        replaceNoButton={
          hasYesShares ? (
            <SellButton
              panelClassName={betPanelClassName}
              contract={contract}
              user={user}
              sharesOutcome={'YES'}
              shares={yesShares}
            />
          ) : undefined
        }
        replaceYesButton={
          hasNoShares ? (
            <SellButton
              panelClassName={betPanelClassName}
              contract={contract}
              user={user}
              sharesOutcome={'NO'}
              shares={noShares}
            />
          ) : undefined
        }
      />
      <Modal open={open} setOpen={setOpen}>
        <SimpleBetPanel
          className={betPanelClassName}
          contract={contract}
          selected={betChoice}
          onBetSuccess={() => setOpen(false)}
        />
      </Modal>
    </>
  )
}
