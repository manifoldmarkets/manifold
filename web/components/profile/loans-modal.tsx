import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { PLURAL_BETS } from 'common/user'
import { ENV_CONFIG } from 'common/envs/constants'

export function LoansModal(props: {
  isOpen: boolean
  setOpen: (open: boolean) => void
}) {
  const { isOpen, setOpen } = props

  return (
    <Modal open={isOpen} setOpen={setOpen}>
      <Col className="bg-canvas-0 text-ink-1000 items-center gap-4 rounded-md px-8 py-6">
        <span className={'text-8xl'}>🏦</span>
        <span className="text-xl">Daily loans on your {PLURAL_BETS}</span>
        <Col className={'gap-2'}>
          <span className={'text-primary-700'}>• What are daily loans?</span>
          <span className={'ml-2'}>
            Every day at midnight PT, get 2% of your total bet amount back as a
            loan.
          </span>
          <span className={'text-primary-700'}>
            • Do I have to pay back a loan?
          </span>
          <span className={'ml-2'}>
            Yes, don't worry! You will automatically pay back loans when the
            market resolves or you sell your bet.
          </span>
          <span className={'text-primary-700'}>
            • What is the purpose of loans?
          </span>
          <span className={'ml-2'}>
            Loans make it worthwhile to bet on markets that won't resolve for
            months or years, because your investment won't be locked up as long.
          </span>
          <span className={'text-primary-700'}>• What is an example?</span>
          <span className={'ml-2'}>
            For example, if you bet {ENV_CONFIG.moneyMoniker}1000 on "Will I
            become a millionare?", you will get {ENV_CONFIG.moneyMoniker}20 back
            tomorrow.
          </span>
          <span className={'ml-2'}>
            Previous loans count against your total bet amount. So on the next
            day, you would get back 2% of {ENV_CONFIG.moneyMoniker}(1000 - 20) =
            {ENV_CONFIG.moneyMoniker}19.6.
          </span>
        </Col>
      </Col>
    </Modal>
  )
}
