import clsx from 'clsx'

import { CPMMBinaryContract } from 'common/contract'
import { useUnfilledBetsAndBalanceByUserId } from '../../hooks/use-bets'
import { useUser } from '../../hooks/use-user'
import { Col } from '../layout/col'
import { Modal, MODAL_CLASS } from '../layout/modal'
import { binaryOutcomes, BuyPanel } from './bet-panel'
import { Subtitle } from '../widgets/subtitle'

export function BetDialog(props: {
  contract: CPMMBinaryContract
  initialOutcome: binaryOutcomes
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { contract, initialOutcome, open, setOpen } = props
  const user = useUser()
  const { unfilledBets, balanceByUserId } = useUnfilledBetsAndBalanceByUserId(
    contract.id
  )

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
        <Subtitle className="!mt-0">{question}</Subtitle>
        <BuyPanel
          contract={contract}
          user={user}
          unfilledBets={unfilledBets}
          balanceByUserId={balanceByUserId}
          mobileView={true}
          hidden={false}
          initialOutcome={initialOutcome}
          onBuySuccess={() => setTimeout(() => setOpen(false), 500)}
          location="contract card"
        />
      </Col>
    </Modal>
  )
}
