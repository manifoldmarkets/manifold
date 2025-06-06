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
import { ShareBetModal } from './share-bet'
import { useState } from 'react'
import { Button } from '../buttons/button'
import { LuShare } from 'react-icons/lu'
import { getPseudonym } from '../charts/contract/choice'
import { formatPercent } from 'common/util/format'
import { useDisplayUserById } from 'web/hooks/use-user-supabase'

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
  const bettor = useDisplayUserById(metric.userId)

  if (metric.invested === 0 && metric.profit === 0) return null

  const isCashContract = contract.token === 'CASH'
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
            {includeSellButton && (
              <SellRow
                contract={contract as CPMMContract}
                user={includeSellButton}
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
        {(contract.mechanism !== 'cpmm-multi-1' || isBinaryMulti(contract)) &&
          maxSharesOutcome &&
          (yesWinnings > 1 || noWinnings > 1) &&
          (resolution === undefined || resolution !== 'CANCEL') && (
            <>
              <Button
                className="h-10"
                size={'lg'}
                color={'green-outline'}
                onClick={() => setShowShareModal(true)}
              >
                <Row className="items-center gap-2">
                  <LuShare className="h-5 w-5" aria-hidden />
                  Share
                </Row>
              </Button>
              {showShareModal && bettor && (
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
