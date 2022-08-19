import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'

export function BettingStreakModal(props: {
  isOpen: boolean
  setOpen: (open: boolean) => void
}) {
  const { isOpen, setOpen } = props

  return (
    <Modal open={isOpen} setOpen={setOpen}>
      <Col className="items-center gap-4 rounded-md bg-white px-8 py-6">
        <span className={'text-8xl'}>🔥</span>
        <span>Betting streaks are here!</span>
        <Col className={'gap-2'}>
          <span className={'text-indigo-700'}>• What are they?</span>
          <span className={'ml-2'}>
            You get a reward for every consecutive day that you place a bet. The
            more days you bet in a row, the more you earn!
          </span>
          <span className={'text-indigo-700'}>
            • Where can I check my streak?
          </span>
          <span className={'ml-2'}>
            You can see your current streak on the top right of your profile
            page.
          </span>
        </Col>
      </Col>
    </Modal>
  )
}
