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

export function UserBetsSummary(props: {
  contract: Contract
  initialMetrics?: ContractMetric
  className?: string
}) {
  const { contract, className } = props
  const metrics = useSavedContractMetrics(contract) ?? props.initialMetrics

  if (!metrics) return <></>
  return (
    <BetsSummary contract={contract} metrics={metrics} className={className} />
  )
}

export function BetsSummary(props: {
  contract: Contract
  metrics: ContractMetric
  className?: string
  hideTweet?: boolean
}) {
  const { contract, metrics, className, hideTweet } = props
  const { resolution, outcomeType } = contract
  const userBets = useUserContractBets(metrics.userId, contract.id)
  const username = metrics.userUsername

  const { payout, invested, totalShares, profit, profitPercent } = userBets
    ? getContractBetMetrics(contract, userBets)
    : metrics

  const yesWinnings = totalShares.YES ?? 0
  const noWinnings = totalShares.NO ?? 0

  const position = yesWinnings - noWinnings
  const exampleOutcome = position < 0 ? 'NO' : 'YES'

  const isBinary = outcomeType === 'BINARY'
  const prob = isBinary ? getProbability(contract) : 0
  const expectation = prob * yesWinnings + (1 - prob) * noWinnings

  if (metrics.invested === 0 && metrics.profit === 0) return null

  return (
    <Col className={clsx('mb-8', className)}>
      <Row className="flex-wrap gap-4 sm:flex-nowrap sm:gap-6">
        {resolution ? (
          <Col>
            <div className="text-ink-500 text-sm">Payout</div>
            <div className="whitespace-nowrap">
              {formatMoney(payout)}{' '}
              <ProfitBadge profitPercent={profitPercent} />
            </div>
          </Col>
        ) : isBinary ? (
          <Col>
            <div className="text-ink-500 whitespace-nowrap text-sm">
              Payout{' '}
              <InfoTooltip
                text={`You'll get ${formatMoney(
                  Math.abs(position)
                )} if this market resolves ${exampleOutcome} (and ${formatMoney(
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
          <Col className="hidden sm:inline">
            <div className="text-ink-500 whitespace-nowrap text-sm">
              Expected value{' '}
              <InfoTooltip text="How much your position in the market is worth right now according to the current market probability." />
            </div>
            <div className="whitespace-nowrap">{formatMoney(payout)}</div>
          </Col>
        )}

        <Col>
          <div className="text-ink-500 whitespace-nowrap text-sm">
            Spent{' '}
            <InfoTooltip text="Cost basis. Cash originally invested in this market, using average cost accounting." />
          </div>
          <div className="whitespace-nowrap">{formatMoney(invested)}</div>
        </Col>

        {isBinary && !resolution && (
          <Col className="hidden sm:inline">
            <div className="text-ink-500 whitespace-nowrap text-sm">
              Expected value{' '}
              <InfoTooltip text="How much your position in the market is worth right now according to the current market probability." />
            </div>
            <div className="whitespace-nowrap">{formatMoney(expectation)}</div>
          </Col>
        )}

        <Col>
          <div className="text-ink-500 whitespace-nowrap text-sm">
            Profit{' '}
            <InfoTooltip text="How much you've made or lost (includes both realized & unrealized profits)." />
          </div>
          <div className="whitespace-nowrap">
            {formatMoney(profit)}
            <ProfitBadge profitPercent={profitPercent} />
          </div>
        </Col>
      </Row>

      {!hideTweet && resolution && profit >= 1 && (
        <Row className={'mt-4 items-center gap-2'}>
          <div>
            You made {formatMoney(profit)} in profit!{' '}
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
