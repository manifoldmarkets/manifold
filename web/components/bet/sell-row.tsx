import clsx from 'clsx'
import { Bet } from 'common/bet'
import { getInvested } from 'common/calculate'
import {
  CPMMContract,
  CPMMMultiContract,
  CPMMNumericContract,
} from 'common/contract'
import { getStonkDisplayShares } from 'common/stonk'
import { User } from 'common/user'
import { formatShares } from 'common/util/format'
import { useState } from 'react'
import { useSaveBinaryShares } from 'web/hooks/use-save-binary-shares'
import { useUserContractBets } from 'web/hooks/use-user-bets'
import { Button } from '../buttons/button'
import { TweetButton, getPositionTweet } from '../buttons/tweet-button'
import { Col } from '../layout/col'
import { Modal } from '../layout/modal'
import { Row } from '../layout/row'
import { OutcomeLabel } from '../outcome-label'
import { Title } from '../widgets/title'
import { MoneyDisplay } from './money-display'
import { SellPanel } from './sell-panel'

export function SellRow(props: {
  contract: CPMMContract
  user: User | null | undefined
  className?: string
  showTweet?: boolean
  hideStatus?: boolean
}) {
  const { className, contract, user, showTweet, hideStatus } = props
  const isStonk = contract.outcomeType === 'STONK'

  const userBets = useUserContractBets(user?.id, contract.id)
  const [showSellModal, setShowSellModal] = useState(false)

  const { mechanism } = contract
  const { sharesOutcome, shares } = useSaveBinaryShares(contract, userBets)
  const isCashContract = contract.token === 'CASH'

  if (sharesOutcome && user && mechanism === 'cpmm-1') {
    return (
      <Col className={className}>
        <Row className="items-center justify-between gap-4">
          {!hideStatus && (
            <div>
              {isStonk ? (
                <>
                  You have {getStonkDisplayShares(contract, shares, 2)} shares
                  of{' '}
                </>
              ) : (
                <>
                  You'll get{' '}
                  <MoneyDisplay
                    amount={shares}
                    isCashContract={isCashContract}
                  />{' '}
                  on{' '}
                </>
              )}
              <OutcomeLabel
                outcome={sharesOutcome}
                contract={contract}
                truncate={'short'}
              />{' '}
            </div>
          )}

          <Button
            className="!py-1"
            size="xs"
            color="gray-outline"
            onClick={(e) => {
              setShowSellModal(true)
              // Necessary in the profile page to prevent the row from being toggled
              e.stopPropagation()
            }}
          >
            Sell
          </Button>
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

          {showTweet && userBets && (
            <TweetButton
              tweetText={getPositionTweet(
                (sharesOutcome === 'NO' ? -1 : 1) * shares,
                getInvested(contract, userBets),
                contract
              )}
            />
          )}
        </Row>
      </Col>
    )
  }

  return null
}

export function SellSharesModal(props: {
  className?: string
  contract: CPMMContract | CPMMMultiContract | CPMMNumericContract
  userBets: Bet[]
  shares: number
  sharesOutcome: 'YES' | 'NO'
  user: User
  setOpen: (open: boolean) => void
  answerId?: string
  binaryPseudonym?: {
    YES: {
      pseudonymName: string
      pseudonymColor: string
    }
    NO: {
      pseudonymName: string
      pseudonymColor: string
    }
  }
}) {
  const {
    className,
    contract,
    shares,
    sharesOutcome,
    userBets,
    user,
    setOpen,
    answerId,
    binaryPseudonym,
  } = props
  const isStonk = contract.outcomeType === 'STONK'
  const isCashContract = contract.token === 'CASH'

  return (
    <Modal open={true} setOpen={setOpen}>
      <Col className={clsx('bg-canvas-0 rounded-md px-8 py-6', className)}>
        <Title>Sell position</Title>

        <div className="mb-6">
          {isStonk ? (
            <>You have {getStonkDisplayShares(contract, shares)} shares of </>
          ) : (
            <>
              You have {formatShares(shares, isCashContract)} shares worth{' '}
              <MoneyDisplay amount={shares} isCashContract={isCashContract} />{' '}
              if this {answerId ? 'answer' : 'question'} resolves{' '}
            </>
          )}
          <OutcomeLabel
            outcome={sharesOutcome}
            contract={contract}
            truncate={'short'}
            answerId={answerId}
            pseudonym={binaryPseudonym}
          />
          .
        </div>

        <SellPanel
          contract={contract}
          shares={shares}
          sharesOutcome={sharesOutcome}
          user={user}
          userBets={userBets ?? []}
          onSellSuccess={() => setOpen(false)}
          answerId={answerId}
          binaryPseudonym={binaryPseudonym}
        />
      </Col>
    </Modal>
  )
}
