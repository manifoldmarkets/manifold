import { BinaryContract } from 'common/contract'
import { User } from 'common/user'
import { useState } from 'react'
import { Col } from './layout/col'
import { Row } from './layout/row'
import { formatWithCommas } from 'common/util/format'
import { OutcomeLabel } from './outcome-label'
import { useUserContractBets } from 'web/hooks/use-user-bets'
import { useSaveShares } from './use-save-shares'
import { SellSharesModal } from './sell-modal'

export function SellRow(props: {
  contract: BinaryContract
  user: User | null | undefined
  className?: string
}) {
  const { className, contract, user } = props

  const userBets = useUserContractBets(user?.id, contract.id)
  const [showSellModal, setShowSellModal] = useState(false)

  const { mechanism } = contract
  const { yesFloorShares, noFloorShares, yesShares, noShares } = useSaveShares(
    contract,
    userBets
  )
  const floorShares = yesFloorShares || noFloorShares
  const sharesOutcome = yesFloorShares
    ? 'YES'
    : noFloorShares
    ? 'NO'
    : undefined

  if (sharesOutcome && user && mechanism === 'cpmm-1') {
    return (
      <div>
        <Col className={className}>
          <Row className="items-center justify-between gap-2 ">
            <div>
              You have {formatWithCommas(floorShares)}{' '}
              <OutcomeLabel
                outcome={sharesOutcome}
                contract={contract}
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
        {showSellModal && (
          <SellSharesModal
            contract={contract}
            user={user}
            userBets={userBets ?? []}
            shares={yesShares || noShares}
            sharesOutcome={sharesOutcome}
            setOpen={setShowSellModal}
          />
        )}
      </div>
    )
  }

  return <div />
}
