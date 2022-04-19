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
import clsx from 'clsx'

export function SellRow(props: {
  contract: FullContract<DPM | CPMM, Binary>
  user: User | null | undefined
  className?: string
  buttonOnly?: boolean
}) {
  const { className } = props

  const userBets = useUserContractBets(props.user?.id, props.contract.id)
  const [showSellModal, setShowSellModal] = useState(false)

  const { mechanism } = props.contract
  const { yesFloorShares, noFloorShares } = useSaveShares(
    props.contract,
    userBets
  )
  const shares = yesFloorShares || noFloorShares
  const sharesOutcome = yesFloorShares
    ? 'YES'
    : noFloorShares
    ? 'NO'
    : undefined

  if (sharesOutcome && props.user && mechanism === 'cpmm-1') {
    return (
      <div>
        {props.buttonOnly ? (
          <Col className={'items-center'}>
            <button
              className={clsx(
                'btn-sm w-24 gap-1',
                // from the yes-no-selector:
                'flex inline-flex flex-row  items-center justify-center rounded-3xl border-2 p-2',
                sharesOutcome === 'NO'
                  ? 'hover:bg-primary-focus border-primary hover:border-primary-focus text-primary hover:text-white'
                  : 'border-red-400 text-red-500 hover:border-red-500 hover:bg-red-500 hover:text-white'
              )}
              onClick={() => setShowSellModal(true)}
            >
              {'Sell ' + sharesOutcome}
            </button>
            <div className={'w-24 text-center text-sm text-gray-500'}>
              {'(' + shares + ' shares)'}
            </div>
          </Col>
        ) : (
          <Col className={className}>
            <Row className="items-center justify-between gap-2 ">
              <div>
                You have {formatWithCommas(shares)}{' '}
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
            </Row>
          </Col>
        )}
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
      </div>
    )
  }

  return <div></div>
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
