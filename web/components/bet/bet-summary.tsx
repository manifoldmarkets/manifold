import clsx from 'clsx'

import { formatMoney } from 'common/util/format'
import { Col } from '../layout/col'
import { Contract } from 'web/lib/firebase/contracts'
import { Row } from '../layout/row'
import { YesLabel, NoLabel } from '../outcome-label'
import { getContractBetMetrics, getProbability } from 'common/calculate'
import { InfoTooltip } from '../widgets/info-tooltip'
import { ProfitBadge } from '../profit-badge'
import { useSavedContractMetrics } from 'web/hooks/use-saved-contract-metrics'
import { ContractMetric } from 'common/contract-metric'
import { useUserContractBets } from 'web/hooks/use-user-bets'
import { getWinningTweet, TweetButton } from '../buttons/tweet-button'
import { CPMMContract } from 'common/contract'
import { SellRow } from 'web/components/bet/sell-row'
import { User } from 'common/user'

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
  const userBets = useUserContractBets(metrics.userId, contract.id)
  const username = metrics.userUsername

  const {
    payout,
    invested,
    totalShares = {},
    profit,
    profitPercent,
  } = userBets ? getContractBetMetrics(contract, userBets) : metrics

  const yesWinnings = totalShares.YES ?? 0
  const noWinnings = totalShares.NO ?? 0

  const position = yesWinnings - noWinnings
  const exampleOutcome = position < 0 ? 'NO' : 'YES'

  const isBinary = outcomeType === 'BINARY'
  const isStonk = outcomeType === 'STONK'
  const prob = contract.mechanism === 'cpmm-1' ? getProbability(contract) : 0
  const expectation = prob * yesWinnings + (1 - prob) * noWinnings

  if (metrics.invested === 0 && metrics.profit === 0) return null

  return (
    <Col className={clsx('mb-8', className)}>
      <Row className="flex-wrap gap-6 sm:flex-nowrap">
        {resolution ? (
          <Col>
            <div className="text-ink-500 text-sm">Payout</div>
            <div className="whitespace-nowrap">
              {formatMoney(payout)}{' '}
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
                    {formatMoney(expectation)}
                  </div>
                </Col>
              </Col>
            ) : isBinary ? (
              <Col>
                <div className="text-ink-500 whitespace-nowrap text-sm">
                  Payout{' '}
                  <InfoTooltip
                    text={`${
                      areYourBets ? "You'll get" : "They'll get"
                    } ${formatMoney(
                      Math.abs(position)
                    )} if this question resolves ${exampleOutcome} (and ${formatMoney(
                      0
                    )} otherwise).`}
                  />
                </div>
                <div className="whitespace-nowrap">
                  {position > 1e-7 ? (
                    <>
                      {formatMoney(position)} on <YesLabel />
                    </>
                  ) : position < -1e-7 ? (
                    <>
                      {formatMoney(-position)} on <NoLabel />
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
                  <div className="whitespace-nowrap">{formatMoney(payout)}</div>
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
          <div className="whitespace-nowrap">{formatMoney(invested)}</div>
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
            <div className="whitespace-nowrap">{formatMoney(expectation)}</div>
          </Col>
        )}

        {!hideProfit && (
          <Col>
            <div className="text-ink-500 whitespace-nowrap text-sm">
              Profit{' '}
              <InfoTooltip
                text={`How much ${
                  areYourBets ? "you've" : "they've"
                } made or lost on this question across all bets (includes both realized & unrealized profits).`}
              />
            </div>
            <div className="whitespace-nowrap">
              {formatMoney(profit)}
              <ProfitBadge profitPercent={profitPercent} round={true} />
            </div>
          </Col>
        )}
      </Row>

      {!hideTweet && resolution && profit >= 1 && (
        <Row className={'mt-4 items-center gap-2'}>
          <div>
            {areYourBets ? 'You' : 'They'} made {formatMoney(profit)} in profit!{' '}
            <TweetButton
              tweetText={getWinningTweet(profit, contract, username)}
              className="ml-2"
            />
          </div>
        </Row>
      )}
    </Col>
  )
}
