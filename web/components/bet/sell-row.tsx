import clsx from 'clsx'
import {
  CPMMContract,
  CPMMMultiContract,
  CPMMNumericContract,
} from 'common/contract'
import { getStonkDisplayShares } from 'common/stonk'
import { User } from 'common/user'
import { formatShares } from 'common/util/format'
import { useState } from 'react'
import { Button } from '../buttons/button'
import { TweetButton, getPositionTweet } from '../buttons/tweet-button'
import { Col } from '../layout/col'
import { Modal } from '../layout/modal'
import { Row } from '../layout/row'
import { OutcomeLabel } from '../outcome-label'
import { Title } from '../widgets/title'
import { MoneyDisplay } from './money-display'
import { SellPanel } from './sell-panel'
import { ContractMetric } from 'common/contract-metric'
import { useSavedContractMetrics } from 'web/hooks/use-saved-contract-metrics'

export function SellRow(props: {
  contract: CPMMContract
  user: User | null | undefined
  className?: string
  showTweet?: boolean
  hideStatus?: boolean
}) {
  const { className, contract, user, showTweet, hideStatus } = props
  const isStonk = contract.outcomeType === 'STONK'

  const metric = useSavedContractMetrics(contract)
  const { totalShares, maxSharesOutcome } = metric ?? {
    totalShares: { YES: 0, NO: 0 },
    maxSharesOutcome: 'YES',
  }
  const sharesOutcome = maxSharesOutcome as 'YES' | 'NO' | null
  const shares = totalShares[sharesOutcome ?? 'YES'] ?? 0
  const [showSellModal, setShowSellModal] = useState(false)

  const { mechanism } = contract
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
              metric={metric}
              user={user}
              shares={shares}
              sharesOutcome={sharesOutcome}
              setOpen={setShowSellModal}
            />
          )}

          {showTweet && metric && (
            <TweetButton
              tweetText={getPositionTweet(
                (sharesOutcome === 'NO' ? -1 : 1) * shares,
                metric.invested,
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
  metric: ContractMetric | undefined
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
    metric,
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
          metric={metric}
          onSellSuccess={() => setOpen(false)}
          answerId={answerId}
          binaryPseudonym={binaryPseudonym}
        />
      </Col>
    </Modal>
  )
}
