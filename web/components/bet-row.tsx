import clsx from 'clsx'
import { useState } from 'react'

import { BetPanelSwitcher } from './bet-panel'
import { Row } from './layout/row'
import { YesNoSelector } from './yes-no-selector'
import { Binary, CPMM, DPM, FullContract } from '../../common/contract'
import { Modal } from './layout/modal'

// Inline version of a bet panel. Opens BetPanel in a new modal.
export default function BetRow(props: {
  contract: FullContract<DPM | CPMM, Binary>
  large?: boolean
  className?: string
  labelClassName?: string
}) {
  const { large, className, labelClassName } = props
  const [open, setOpen] = useState(false)
  const [betChoice, setBetChoice] = useState<'YES' | 'NO' | undefined>(
    undefined
  )

  return (
    <>
      <div className={className}>
        <Row className="items-center justify-end gap-2">
          <div className={clsx('mr-2 text-gray-400', labelClassName)}>
            Place a trade
          </div>
          <YesNoSelector
            btnClassName={clsx('btn-sm w-20', large && 'w-32 h-10')}
            large={large}
            onSelect={(choice) => {
              setOpen(true)
              setBetChoice(choice)
            }}
          />
        </Row>
        <Modal open={open} setOpen={setOpen}>
          <BetPanelSwitcher
            contract={props.contract}
            title={props.contract.question}
            selected={betChoice}
            onBetSuccess={() => setOpen(false)}
          />
        </Modal>
      </div>
    </>
  )
}
