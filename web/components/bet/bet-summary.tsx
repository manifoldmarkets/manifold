import clsx from 'clsx'
import { clamp } from 'lodash'

import {
  formatMoney,
  formatMoneyNumber,
  formatWithCommas,
} from 'common/util/format'
import { Col } from '../layout/col'
import { Contract, contractUrl } from 'web/lib/firebase/contracts'
import { Row } from '../layout/row'
import { YesLabel, NoLabel } from '../outcome-label'
import { getContractBetMetrics, getProbability } from 'common/calculate'
import { InfoTooltip } from '../widgets/info-tooltip'
import { ProfitBadge } from '../profit-badge'
import { useSavedContractMetrics } from 'web/hooks/use-saved-contract-metrics'
import { ENV_CONFIG } from 'common/envs/constants'
import { ContractMetric } from 'common/contract-metric'
import { useUserContractBets } from 'web/hooks/use-user-bets'
import { TweetButton } from '../buttons/tweet-button'

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
            <div className="text-sm text-gray-500">Payout</div>
            <div className="whitespace-nowrap">
              {formatMoney(payout)}{' '}
              <ProfitBadge profitPercent={profitPercent} />
            </div>
          </Col>
        ) : isBinary ? (
          <Col>
            <div className="whitespace-nowrap text-sm text-gray-500">
              Position{' '}
              <InfoTooltip
                text={`Number of shares you own on net. 1 ${exampleOutcome} share = ${ENV_CONFIG.moneyMoniker}1 if the market resolves ${exampleOutcome}.`}
              />
            </div>
            <div className="whitespace-nowrap">
              {position > 1e-7 ? (
                <>
                  {formatWithCommas(position)} <YesLabel />
                </>
              ) : position < -1e-7 ? (
                <>
                  {formatWithCommas(-position)} <NoLabel />
                </>
              ) : (
                '——'
              )}
            </div>
          </Col>
        ) : (
          <Col className="hidden sm:inline">
            <div className="whitespace-nowrap text-sm text-gray-500">
              Expectation{''}
              <InfoTooltip text="The estimated payout of your position using the current market probability." />
            </div>
            <div className="whitespace-nowrap">{formatMoney(payout)}</div>
          </Col>
        )}

        <Col>
          <div className="whitespace-nowrap text-sm text-gray-500">
            Cost basis{' '}
            <InfoTooltip text="Cash originally invested in this market, using average cost accounting." />
          </div>
          <div className="whitespace-nowrap">{formatMoney(invested)}</div>
        </Col>

        {isBinary && !resolution && (
          <Col className="hidden sm:inline">
            <div className="whitespace-nowrap text-sm text-gray-500">
              Expectation{' '}
              <InfoTooltip text="The estimated payout of your position using the current market probability." />
            </div>
            <div className="whitespace-nowrap">{formatMoney(expectation)}</div>
          </Col>
        )}

        <Col>
          <div className="whitespace-nowrap text-sm text-gray-500">
            Profit{' '}
            <InfoTooltip text="Includes both realized & unrealized gains/losses." />
          </div>
          <div className="whitespace-nowrap">
            {formatMoney(profit)}
            <ProfitBadge profitPercent={profitPercent} />
          </div>
        </Col>
      </Row>

      {!hideTweet && !resolution && Math.abs(position) > 1e-7 && (
        <Row className={'mt-4 items-center gap-2'}>
          <div>
            You're betting {position > 0 ? <YesLabel /> : <NoLabel />}.{' '}
            <TweetButton
              tweetText={getPositionTweet(position, invested, contract)}
              className="ml-2"
            />
          </div>
        </Row>
      )}

      {!hideTweet && resolution && profit >= 1 && (
        <Row className={'mt-4 items-center gap-2'}>
          <div>
            You made {formatMoney(profit)} in profit!{' '}
            <TweetButton
              tweetText={getWinningTweet(profit, contract)}
              className="ml-2"
            />
          </div>
        </Row>
      )}
    </Col>
  )
}

const getPositionTweet = (
  position: number,
  invested: number,
  contract: Contract
) => {
  const r = invested / (invested + Math.abs(position))
  const set1 = clamp(Math.round((1 - r) * 10), 1, 10)
  const set2 = clamp(Math.round(r * 10), 1, 10)
  const blockString =
    position > 0
      ? repeat('🟩', set1) + ':' + repeat('🟥', set2)
      : repeat('🟥', set1) + ':' + repeat('🟩', set2)

  return `${blockString}\nI'm betting ${
    position > 0 ? 'YES' : 'NO'
  } at M$${formatMoneyNumber(invested)} to M$${formatMoneyNumber(
    Math.abs(position)
  )} on\n'${contract.question}' ${contractUrl(contract)}`
}

const getWinningTweet = (profit: number, contract: Contract) => {
  return `I made M$${formatMoneyNumber(profit)} in profit trading on\n'${
    contract.question
  }'! ${contractUrl(contract)}`
}

const repeat = (str: string, n: number) => new Array(n).fill(str).join('')
