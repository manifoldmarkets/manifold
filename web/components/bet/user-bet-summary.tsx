import clsx from 'clsx'

import { getProbability } from 'common/calculate'
import {
  Contract,
  CPMMContract,
  CPMMMultiContract,
  getMainBinaryMCAnswer,
  isBinaryMulti,
} from 'common/contract'
import { ContractMetric, getMaxSharesOutcome } from 'common/contract-metric'
import { TRADE_TERM } from 'common/envs/constants'
import { noFees } from 'common/fees'
import { User } from 'common/user'
import { formatPercent } from 'common/util/format'
import { useState } from 'react'
import { BinaryMultiSellRow } from 'web/components/answers/answer-components'
import { MultiNumericSellPanel } from 'web/components/answers/numeric-sell-panel'
import { SellRow } from 'web/components/bet/sell-row'
import { useAdmin } from 'web/hooks/use-admin'
import { useSavedContractMetrics } from 'web/hooks/use-saved-contract-metrics'
import { useUser } from 'web/hooks/use-user'
import { useDisplayUserById } from 'web/hooks/use-user-supabase'
import { Button } from '../buttons/button'
import { getWinningTweet, TweetButton } from '../buttons/tweet-button'
import { getPseudonym } from '../charts/contract/choice'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { NoLabel, YesLabel } from '../outcome-label'
import { ProfitBadge } from '../profit-badge'
import { InfoTooltip } from '../widgets/info-tooltip'
import { MoneyDisplay } from './money-display'
import { SellSharesModal } from './sell-row'
import { ShareBetModal } from './share-bet'
import { ANNUAL_INTEREST_RATE } from 'common/economy'

export function UserBetsSummary(props: {
  contract: Contract
  initialMetrics?: ContractMetric
  className?: string
  includeSellButton?: User | null | undefined
}) {
  const { contract, className, includeSellButton } = props
  const metrics = useSavedContractMetrics(contract) ?? props.initialMetrics

  if (!metrics) return <></>
  return (
    <BetsSummary
      contract={contract}
      metric={metrics}
      className={className}
      includeSellButton={includeSellButton}
      areYourBets
    />
  )
}

export function BetsSummary(props: {
  contract: Contract
  metric: ContractMetric
  areYourBets: boolean
  className?: string
  includeSellButton?: User | null | undefined
}) {
  const { contract, metric, className, includeSellButton, areYourBets } = props
  const { resolution, outcomeType } = contract
  const [showShareModal, setShowShareModal] = useState(false)
  const [showAdminSellModal, setShowAdminSellModal] = useState(false)

  const { payout, invested, totalShares = {}, profit, profitPercent } = metric

  const maxSharesOutcome = getMaxSharesOutcome(metric)
  const yesWinnings = totalShares.YES ?? 0
  const noWinnings = totalShares.NO ?? 0

  const position = yesWinnings - noWinnings
  const exampleOutcome = position < 0 ? 'NO' : 'YES'

  const isBinary = outcomeType === 'BINARY'
  const isStonk = outcomeType === 'STONK'
  const mainBinaryMCAnswer = getMainBinaryMCAnswer(contract)
  const prob = contract.mechanism === 'cpmm-1' ? getProbability(contract) : 0
  const expectation = prob * yesWinnings + (1 - prob) * noWinnings
  const user = useUser()
  const isAdmin = useAdmin()
  const bettor = useDisplayUserById(metric.userId)
  const isCashContract = contract.token === 'CASH'

  if (metric.invested === 0 && metric.profit === 0) return null

  const avgPrice = maxSharesOutcome
    ? metric.invested / metric.totalShares[maxSharesOutcome]
    : 0

  return (
    <Col className={clsx(className)}>
      <Row className={clsx('flex-wrap items-center gap-4 sm:gap-6')}>
        {resolution ? (
          <Col>
            <div className="text-ink-500 text-sm">Payout</div>
            <div className="whitespace-nowrap">
              <MoneyDisplay amount={payout} isCashContract={isCashContract} />{' '}
              <ProfitBadge profitPercent={profitPercent} />
            </div>
          </Col>
        ) : (
          <Row className={'items-end gap-1'}>
            {isStonk ? (
              <Col>
                <Col>
                  <div className="text-ink-500 whitespace-nowrap text-sm">
                    Value
                    <InfoTooltip
                      text={`How much ${
                        areYourBets ? 'your' : 'their'
                      } position in the question is worth right now according to the current stock price.`}
                    />
                  </div>
                  <div className="whitespace-nowrap">
                    <MoneyDisplay
                      amount={expectation}
                      isCashContract={isCashContract}
                    />
                  </div>
                </Col>
              </Col>
            ) : isBinary ? (
              <Col>
                <div className="text-ink-500 whitespace-nowrap text-sm">
                  Payout{' '}
                  <InfoTooltip
                    text={
                      <>
                        {areYourBets ? "You'll get " : "They'll get "}
                        <MoneyDisplay
                          amount={Math.abs(position)}
                          isCashContract={isCashContract}
                        />{' '}
                        if this question resolves {exampleOutcome} (and{' '}
                        <MoneyDisplay
                          amount={0}
                          isCashContract={isCashContract}
                        />{' '}
                        otherwise). You're earning{' '}
                        {formatPercent(ANNUAL_INTEREST_RATE)} annual interest on
                        this position.
                      </>
                    }
                  />
                </div>
                <div className="whitespace-nowrap">
                  {position > 1e-7 ? (
                    <>
                      <MoneyDisplay
                        amount={position}
                        isCashContract={isCashContract}
                      />{' '}
                      on <YesLabel />
                    </>
                  ) : position < -1e-7 ? (
                    <>
                      <MoneyDisplay
                        amount={-position}
                        isCashContract={isCashContract}
                      />{' '}
                      on <NoLabel />
                    </>
                  ) : (
                    '——'
                  )}
                </div>
              </Col>
            ) : (
              <Col className="hidden sm:inline">
                <div className="text-ink-500 whitespace-nowrap text-sm">
                  Expected value{' '}
                  <InfoTooltip
                    text={`How much ${
                      areYourBets ? 'your' : 'their'
                    } position in the question is worth right now according to the current probability.`}
                  />
                </div>
                <div className="whitespace-nowrap">
                  <MoneyDisplay
                    amount={payout}
                    isCashContract={isCashContract}
                  />
                </div>
              </Col>
            )}
            {includeSellButton &&
              (contract.mechanism !== 'cpmm-multi-1' ||
                isBinaryMulti(contract)) && (
                <Row className="items-center gap-2">
                  <SellRow
                    contract={contract as CPMMContract}
                    user={includeSellButton}
                    hideStatus={true}
                  />
                  {maxSharesOutcome &&
                    (yesWinnings > 1 || noWinnings > 1) &&
                    (resolution === undefined || resolution !== 'CANCEL') && (
                      <Button
                        className="!py-1"
                        size="xs"
                        color="gray-outline"
                        onClick={() => setShowShareModal(true)}
                      >
                        Share
                      </Button>
                    )}
                </Row>
              )}
          </Row>
        )}

        <Row className="gap-4 sm:contents">
          <Col>
            <div className="text-ink-500 whitespace-nowrap text-sm">
              Spent{' '}
              <InfoTooltip text="Cost basis. Cash originally invested in this question, using average cost accounting." />
            </div>
            <div className="whitespace-nowrap">
              <MoneyDisplay amount={invested} isCashContract={isCashContract} />
            </div>
          </Col>

          <Col>
            <div className="text-ink-500 whitespace-nowrap text-sm">
              Profit{' '}
              <InfoTooltip
                text={`How much ${
                  areYourBets ? "you've" : "they've"
                } made or lost on this question across all ${TRADE_TERM}s (includes both realized & unrealized profits).`}
              />
            </div>
            <div className="whitespace-nowrap">
              <MoneyDisplay amount={profit} isCashContract={isCashContract} />
              <ProfitBadge profitPercent={profitPercent} round={true} />
            </div>
          </Col>
        </Row>

        {isBinary && !resolution && (
          <Col className="hidden sm:inline">
            <div className="text-ink-500 whitespace-nowrap text-sm">
              Expected value{' '}
              <InfoTooltip
                text={`How much ${
                  areYourBets ? 'your' : 'their'
                } position in the question is worth right now according to the current probability.`}
              />
            </div>
            <div className="whitespace-nowrap">
              <MoneyDisplay
                amount={expectation}
                isCashContract={isCashContract}
              />
            </div>
          </Col>
        )}

        {/* Share modal - button is now in the Sell/Loan row */}
        {showShareModal && bettor && maxSharesOutcome && (
          <ShareBetModal
            open={showShareModal}
            setOpen={setShowShareModal}
            questionText={contract.question}
            outcome={mainBinaryMCAnswer ? 'YES' : maxSharesOutcome}
            answer={
              getPseudonym(contract)?.[maxSharesOutcome as 'YES' | 'NO']
                ?.pseudonymName
            }
            avgPrice={formatPercent(
              maxSharesOutcome === 'YES' ? avgPrice : 1 - avgPrice
            )}
            betAmount={metric.invested}
            winAmount={metric.totalShares[maxSharesOutcome]}
            resolution={resolution}
            profit={metric.profit}
            bettor={{
              id: bettor.id,
              name: bettor.name,
              username: bettor.username,
              avatarUrl: bettor.avatarUrl,
            }}
          />
        )}
        {/* Admin sell button - only show for admins viewing other users' bets */}
        {isAdmin &&
          user &&
          bettor &&
          !areYourBets &&
          !resolution &&
          maxSharesOutcome &&
          (yesWinnings > 1 || noWinnings > 1) &&
          contract.mechanism === 'cpmm-1' && (
            <>
              <Button
                className="h-10"
                size={'lg'}
                color={'red-outline'}
                onClick={() => setShowAdminSellModal(true)}
              >
                Admin Sell
              </Button>
              {showAdminSellModal && (
                <SellSharesModal
                  contract={{
                    ...(contract as CPMMContract),
                    collectedFees:
                      (contract as CPMMContract).collectedFees ?? noFees,
                  }}
                  metric={metric}
                  user={user}
                  shares={Math.abs(position)}
                  sharesOutcome={maxSharesOutcome as 'YES' | 'NO'}
                  setOpen={setShowAdminSellModal}
                  sellForUserId={metric.userId}
                />
              )}
            </>
          )}
        {resolution && resolution !== 'CANCEL' && (
          <TweetButton
            className="h-10"
            tweetText={getWinningTweet(profit, contract, user?.username ?? '')}
          />
        )}
      </Row>
      {mainBinaryMCAnswer && (
        <BinaryMultiSellRow
          answer={mainBinaryMCAnswer}
          contract={contract as CPMMMultiContract}
        />
      )}
      {includeSellButton && contract.outcomeType === 'NUMBER' && (
        <MultiNumericSellPanel contract={contract} userId={metric.userId} />
      )}
    </Col>
  )
}
