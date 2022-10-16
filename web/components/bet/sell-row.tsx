import { BinaryContract, CPMMBinaryContract, PseudoNumericContract } from 'common/contract'
import { User } from 'common/user'
import { useState } from 'react'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { formatWithCommas } from 'common/util/format'
import { OutcomeLabel } from '../outcome-label'
import { useUserContractBets } from 'web/hooks/use-user-bets'
import { useSaveBinaryShares } from '../../hooks/use-save-binary-shares'
import { Button } from '../buttons/button'
import clsx from 'clsx'
import { Bet } from 'common/bet'
import { Modal } from '../layout/modal'
import { Title } from '../widgets/title'
import { SellPanel } from './sell-panel'

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

function SellSharesModal(props: {
  className?: string
  contract: CPMMBinaryContract | PseudoNumericContract
  userBets: Bet[]
  shares: number
  sharesOutcome: 'YES' | 'NO'
  user: User
  setOpen: (open: boolean) => void
}) {
  const {
    className,
    contract,
    shares,
    sharesOutcome,
    userBets,
    user,
    setOpen,
  } = props

  return (
    <Modal open={true} setOpen={setOpen}>
      <Col className={clsx('rounded-md bg-white px-8 py-6', className)}>
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