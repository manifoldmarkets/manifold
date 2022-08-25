import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'

export function LoansModal(props: {
  isOpen: boolean
  setOpen: (open: boolean) => void
}) {
  const { isOpen, setOpen } = props

  return (
    <Modal open={isOpen} setOpen={setOpen}>
      <Col className="items-center gap-4 rounded-md bg-white px-8 py-6">
        <span className={'text-8xl'}>🏦</span>
        <span className="text-xl">Daily loans on your bets</span>
        <Col className={'gap-2'}>
          <span className={'text-indigo-700'}>• What are daily loans?</span>
          <span className={'ml-2'}>
            Every day at midnight PT, get 1% of your total bet amount back as a
            loan.
          </span>
          <span className={'text-indigo-700'}>
            • Do I have to pay back a loan?
          </span>
          <span className={'ml-2'}>
            Yes, don't worry! You will automatically pay back loans when the
            market resolves or you sell your bet.
          </span>
          <span className={'text-indigo-700'}>
            • What is the purpose of loans?
          </span>
          <span className={'ml-2'}>
            Loans make it worthwhile to bet on markets that won't resolve for
            months or years, because your investment won't be locked up as long.
          </span>
          <span className={'text-indigo-700'}>• What is an example?</span>
          <span className={'ml-2'}>
            For example, if you bet M$1000 on "Will I become a millionare?" on
            Monday, you will get M$10 back on Tuesday.
          </span>
          <span className={'ml-2'}>
            Previous loans count against your total bet amount. So on Wednesday,
            you would get back 1% of M$990 = M$9.9.
          </span>
        </Col>
      </Col>
    </Modal>
  )
}
