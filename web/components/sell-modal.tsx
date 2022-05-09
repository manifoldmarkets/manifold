import { Binary, CPMM, FullContract } from 'common/contract'
import { Bet } from 'common/bet'
import { User } from 'common/user'
import { Modal } from './layout/modal'
import { Col } from './layout/col'
import { Title } from './title'
import { formatWithCommas } from 'common/util/format'
import { OutcomeLabel } from './outcome-label'
import { SellPanel } from './bet-panel'

export function SellSharesModal(props: {
  contract: FullContract<CPMM, Binary>
  userBets: Bet[]
  shares: number
  sharesOutcome: 'YES' | 'NO'
  user: User
  setOpen: (open: boolean) => void
}) {
  const { contract, shares, sharesOutcome, userBets, user, setOpen } = props

  return (
    <Modal open={true} setOpen={setOpen}>
      <Col className="rounded-md bg-white px-8 py-6">
        <Title className="!mt-0" text={'Sell shares'} />

        <div className="mb-6">
          You have {formatWithCommas(Math.floor(shares))}{' '}
          <OutcomeLabel
            outcome={sharesOutcome}
            contract={contract}
            truncate={'short'}
          />{' '}
          shares
        </div>

        <SellPanel
          contract={contract}
          shares={shares}
          sharesOutcome={sharesOutcome}
          user={user}
          userBets={userBets ?? []}
          onSellSuccess={() => setOpen(false)}
        />
      </Col>
    </Modal>
  )
}
