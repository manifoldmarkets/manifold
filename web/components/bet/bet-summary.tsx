import clsx from 'clsx'

import { getProbability } from 'common/calculate'
import {
  Contract,
  CPMMContract,
  CPMMMultiContract,
  getMainBinaryMCAnswer,
} from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { TRADE_TERM } from 'common/envs/constants'
import { User } from 'common/user'
import { BinaryMultiSellRow } from 'web/components/answers/answer-components'
import { MultiNumericSellPanel } from 'web/components/answers/numeric-sell-panel'
import { SellRow } from 'web/components/bet/sell-row'
import { useSavedContractMetrics } from 'web/hooks/use-saved-contract-metrics'
import { getWinningTweet, TweetButton } from '../buttons/tweet-button'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { NoLabel, YesLabel } from '../outcome-label'
import { ProfitBadge } from '../profit-badge'
import { InfoTooltip } from '../widgets/info-tooltip'
import { MoneyDisplay } from './money-display'
import { useUser } from 'web/hooks/use-user'

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
      metrics={metrics}
      className={className}
      includeSellButton={includeSellButton}
      areYourBets
    />
  )
}

export function BetsSummary(props: {
  contract: Contract
  metrics: ContractMetric
  areYourBets: boolean
  className?: string
  hideTweet?: boolean
  hideProfit?: boolean
  hideValue?: boolean
  includeSellButton?: User | null | undefined
}) {
  const {
    contract,
    metrics,
    className,
    hideTweet,
    hideProfit,
    includeSellButton,
    hideValue,
    areYourBets,
  } = props
  const { resolution, outcomeType } = contract

  const { payout, invested, totalShares = {}, profit, profitPercent } = metrics

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

  if (metrics.invested === 0 && metrics.profit === 0) return null

  const isCashContract = contract.token === 'CASH'

  return (
    <Col className={clsx(className)}>
      <Row className="flex-wrap gap-6 sm:flex-nowrap">
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
                        otherwise).
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
              !hideValue && (
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
              )
            )}
            {includeSellButton && (
              <SellRow
                contract={contract as CPMMContract}
                user={includeSellButton}
                showTweet={false}
                hideStatus={true}
                className={'-mt-1'}
              />
            )}
          </Row>
        )}

        <Col>
          <div className="text-ink-500 whitespace-nowrap text-sm">
            Spent{' '}
            <InfoTooltip text="Cost basis. Cash originally invested in this question, using average cost accounting." />
          </div>
          <div className="whitespace-nowrap">
            <MoneyDisplay amount={invested} isCashContract={isCashContract} />
          </div>
        </Col>

        {isBinary && !resolution && !hideValue && (
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

        {!hideProfit && (
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
        )}
      </Row>

      {!hideTweet && resolution && profit >= 1 && (
        <Row className={'mt-4 items-center gap-2'}>
          <div>
            {areYourBets ? 'You' : 'They'} made{' '}
            <MoneyDisplay amount={profit} isCashContract={isCashContract} /> in
            profit!{' '}
            <TweetButton
              tweetText={getWinningTweet(
                profit,
                contract,
                user?.username ?? ''
              )}
              className="ml-2"
            />
          </div>
        </Row>
      )}
      {mainBinaryMCAnswer && (
        <BinaryMultiSellRow
          answer={mainBinaryMCAnswer}
          contract={contract as CPMMMultiContract}
        />
      )}
      {includeSellButton && contract.outcomeType === 'NUMBER' && (
        <MultiNumericSellPanel contract={contract} userId={metrics.userId} />
      )}
    </Col>
  )
}
