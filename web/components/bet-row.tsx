import clsx from 'clsx'
import { useState } from 'react'

import { BetPanelSwitcher } from './bet-panel'
import { Row } from './layout/row'
import { YesNoSelector } from './yes-no-selector'
import { Binary, CPMM, DPM, FullContract } from '../../common/contract'
import { Modal } from './layout/modal'
import { SellButton, SellRow } from './sell-row'
import { useUser } from '../hooks/use-user'
import { useUserContractBets } from '../hooks/use-user-bets'
import { useSaveShares } from './use-save-shares'

// Inline version of a bet panel. Opens BetPanel in a new modal.
export default function BetRow(props: {
  contract: FullContract<DPM | CPMM, Binary>
  className?: string
  labelClassName?: string
}) {
  const { className, labelClassName, contract } = props
  const [open, setOpen] = useState(false)
  const [betChoice, setBetChoice] = useState<'YES' | 'NO' | undefined>(
    undefined
  )
  const user = useUser()
  const userBets = useUserContractBets(user?.id, contract.id)
  const { yesFloorShares, noFloorShares } = useSaveShares(contract, userBets)

  return (
    <>
      <div className={className}>
        <Row className="mt-2 justify-end space-x-3">
          {/* <div className={clsx('mr-2 text-gray-400', labelClassName)}>
            Place a trade
          </div> */}
          <YesNoSelector
            btnClassName="btn-sm w-24"
            onSelect={(choice) => {
              setOpen(true)
              setBetChoice(choice)
            }}
            replaceNoButton={
              yesFloorShares > noFloorShares && yesFloorShares > 0 ? (
                <SellButton contract={contract} user={user} />
              ) : undefined
            }
            replaceYesButton={
              noFloorShares > yesFloorShares && noFloorShares > 0 ? (
                <SellButton contract={contract} user={user} />
              ) : undefined
            }
          />
        </Row>
        <Modal open={open} setOpen={setOpen}>
          <BetPanelSwitcher
            contract={contract}
            title={contract.question}
            selected={betChoice}
            onBetSuccess={() => setOpen(false)}
          />
        </Modal>
      </div>
    </>
  )
}
