import { Binary, CPMM, DPM, FullContract } from '../../common/contract'
import { User } from '../../common/user'
import { Bet } from '../../common/bet'
import { useState } from 'react'
import { Col } from './layout/col'
import { Row } from './layout/row'
import { formatWithCommas } from '../../common/util/format'
import { OutcomeLabel } from './outcome-label'
import { Modal } from './layout/modal'
import { Title } from './title'
import { SellPanel, useSaveShares } from './bet-panel'
import { useUserContractBets } from '../hooks/use-user-bets'

export function SellRow(props: {
  contract: FullContract<DPM | CPMM, Binary>
  user: User | null | undefined
  className?: string
}) {
  const { className } = props

  const userBets = useUserContractBets(props.user?.id, props.contract.id)
  const [showSellModal, setShowSellModal] = useState(false)

  const { mechanism } = props.contract
  const { yesShares, noShares } = useSaveShares(props.contract, userBets)

  const shares = yesShares || noShares
  const sharesOutcome = yesShares ? 'YES' : noShares ? 'NO' : undefined

  return (
    <div>
      {sharesOutcome && props.user && mechanism === 'cpmm-1' && (
        <Col className={className}>
          <Row className="items-center justify-between gap-2 ">
            <div>
              You have {formatWithCommas(Math.floor(shares))}{' '}
              <OutcomeLabel
                outcome={sharesOutcome}
                contract={props.contract}
                truncate={'short'}
              />{' '}
              shares
            </div>

            <button
              className="btn btn-sm"
              style={{
                backgroundColor: 'white',
                border: '2px solid',
                color: '#3D4451',
              }}
              onClick={() => setShowSellModal(true)}
            >
              Sell
            </button>

            {showSellModal && (
              <SellSharesModal
                contract={props.contract as FullContract<CPMM, Binary>}
                user={props.user}
                userBets={userBets ?? []}
                shares={shares}
                sharesOutcome={sharesOutcome}
                setOpen={setShowSellModal}
              />
            )}
          </Row>
        </Col>
        // </div>
      )}
    </div>
  )
}

function SellSharesModal(props: {
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
            contract={props.contract}
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
