import { BinaryContract, PseudoNumericContract } from 'common/contract'
import { User } from 'common/user'
import { useState } from 'react'
import { Col } from './layout/col'
import { Row } from './layout/row'
import { formatWithCommas } from 'common/util/format'
import { OutcomeLabel } from './outcome-label'
import { useUserContractBets } from 'web/hooks/use-user-bets'
import { useSaveBinaryShares } from './use-save-binary-shares'
import { SellSharesModal } from './sell-modal'
import { Button } from './button'

export function SellRow(props: {
  contract: BinaryContract | PseudoNumericContract
  user: User | null | undefined
  className?: string
}) {
  const { className, contract, user } = props

  const userBets = useUserContractBets(user?.id, contract.id)
  const [showSellModal, setShowSellModal] = useState(false)

  const { mechanism } = contract
  const { sharesOutcome, shares } = useSaveBinaryShares(contract, userBets)

  if (sharesOutcome && user && mechanism === 'cpmm-1') {
    return (
      <div>
        <Col className={className}>
          <Row className="items-center justify-between gap-2 ">
            <div>
              You have {formatWithCommas(shares)}{' '}
              <OutcomeLabel
                outcome={sharesOutcome}
                contract={contract}
                truncate={'short'}
              />{' '}
              shares
            </div>

            <Button
              className="my-auto"
              size="xs"
              color="gray-outline"
              onClick={() => setShowSellModal(true)}
            >
              Sell
            </Button>
          </Row>
        </Col>
        {showSellModal && (
          <SellSharesModal
            contract={contract}
            user={user}
            userBets={userBets ?? []}
            shares={shares}
            sharesOutcome={sharesOutcome}
            setOpen={setShowSellModal}
          />
        )}
      </div>
    )
  }

  return <div />
}
