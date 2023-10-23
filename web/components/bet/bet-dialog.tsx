import clsx from 'clsx'

import { CPMMBinaryContract } from 'common/contract'
import { useUser } from '../../hooks/use-user'
import { Col } from '../layout/col'
import { Modal, MODAL_CLASS } from '../layout/modal'
import { BinaryOutcomes, BuyPanel } from './bet-panel'
import { Subtitle } from '../widgets/subtitle'

export function BetDialog(props: {
  contract: CPMMBinaryContract
  initialOutcome: BinaryOutcomes
  open: boolean
  setOpen: (open: boolean) => void
  trackingLocation: string
}) {
  const { contract, initialOutcome, open, setOpen, trackingLocation } = props
  const user = useUser()
  const { question } = contract

  return (
    <Modal
      open={open}
      setOpen={setOpen}
      className={clsx(
        MODAL_CLASS,
        'pointer-events-auto max-h-[32rem] overflow-auto'
      )}
    >
      <Col>
        <Subtitle className="!mb-4 !mt-0 !text-xl">{question}</Subtitle>
        <BuyPanel
          contract={contract}
          user={user}
          initialOutcome={initialOutcome}
          onBuySuccess={() => setTimeout(() => setOpen(false), 500)}
          location={trackingLocation}
          inModal={true}
        />
      </Col>
    </Modal>
  )
}
