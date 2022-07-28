import clsx from 'clsx'
import Link from 'next/link'
import { Row } from '../layout/row'
import { formatLargeNumber, formatPercent } from 'common/util/format'
import { contractPath, getBinaryProbPercent } from 'web/lib/firebase/contracts'
import { Col } from '../layout/col'
import {
  BinaryContract,
  Contract,
  FreeResponseContract,
  MultipleChoiceContract,
  NumericContract,
  PseudoNumericContract,
} from 'common/contract'
import {
  AnswerLabel,
  BinaryContractOutcomeLabel,
  CancelLabel,
  FreeResponseOutcomeLabel,
} from '../outcome-label'
import {
  getOutcomeProbability,
  getProbability,
  getTopAnswer,
} from 'common/calculate'
import { AvatarDetails, MiscDetails, ShowTime } from './contract-details'
import { getExpectedValue, getValueFromBucket } from 'common/calculate-dpm'
import { getColor, ProbBar, QuickBet } from './quick-bet'
import { useContractWithPreload } from 'web/hooks/use-contract'
import { useUser } from 'web/hooks/use-user'
import { track } from '@amplitude/analytics-browser'
import { trackCallback } from 'web/lib/service/analytics'
import { formatNumericProbability } from 'common/pseudo-numeric'

export function ContractCard(props: {
  contract: Contract
  showHotVolume?: boolean
  showTime?: ShowTime
  className?: string
  onClick?: () => void
  hideQuickBet?: boolean
  hideGroupLink?: boolean
}) {
  const {
    showHotVolume,
    showTime,
    className,
    onClick,
    hideQuickBet,
    hideGroupLink,
  } = props
  const contract = useContractWithPreload(props.contract) ?? props.contract
  const { question, outcomeType } = contract
  const { resolution } = contract

  const user = useUser()

  const marketClosed =
    (contract.closeTime || Infinity) < Date.now() || !!resolution

  const showQuickBet =
    user &&
    !marketClosed &&
    (outcomeType === 'BINARY' || outcomeType === 'PSEUDO_NUMERIC') &&
    !hideQuickBet

  return (
    <div>
      <Col
        className={clsx(
          'relative gap-3 rounded-lg bg-white py-4 pl-6 pr-5 shadow-md hover:cursor-pointer hover:bg-gray-100',
          className
        )}
      >
        <Row>
          <Col className="relative flex-1 gap-3 pr-1">
            <div
              className={clsx(
                'peer absolute -left-6 -top-4 -bottom-4 right-0 z-10'
              )}
            >
              {onClick ? (
                <a
                  className="absolute top-0 left-0 right-0 bottom-0"
                  href={contractPath(contract)}
                  onClick={(e) => {
                    // Let the browser handle the link click (opens in new tab).
                    if (e.ctrlKey || e.metaKey) return

                    e.preventDefault()
                    track('click market card', {
                      slug: contract.slug,
                      contractId: contract.id,
                    })
                    onClick()
                  }}
                />
              ) : (
                <Link href={contractPath(contract)}>
                  <a
                    onClick={trackCallback('click market card', {
                      slug: contract.slug,
                      contractId: contract.id,
                    })}
                    className="absolute top-0 left-0 right-0 bottom-0"
                  />
                </Link>
              )}
            </div>
            <AvatarDetails contract={contract} />
            <p
              className="break-words font-semibold text-indigo-700 peer-hover:underline peer-hover:decoration-indigo-400 peer-hover:decoration-2"
              style={{ /* For iOS safari */ wordBreak: 'break-word' }}
            >
              {question}
            </p>

            {outcomeType === 'FREE_RESPONSE' &&
              (resolution ? (
                <FreeResponseOutcomeLabel
                  contract={contract}
                  resolution={resolution}
                  truncate={'long'}
                />
              ) : (
                <FreeResponseTopAnswer contract={contract} truncate="long" />
              ))}

            <MiscDetails
              contract={contract}
              showHotVolume={showHotVolume}
              showTime={showTime}
              hideGroupLink={hideGroupLink}
            />
          </Col>
          {showQuickBet ? (
            <QuickBet contract={contract} user={user} />
          ) : (
            <Col className="m-auto pl-2">
              {outcomeType === 'BINARY' && (
                <BinaryResolutionOrChance
                  className="items-center"
                  contract={contract}
                />
              )}

              {outcomeType === 'PSEUDO_NUMERIC' && (
                <PseudoNumericResolutionOrExpectation
                  className="items-center"
                  contract={contract}
                />
              )}

              {outcomeType === 'NUMERIC' && (
                <NumericResolutionOrExpectation
                  className="items-center"
                  contract={contract}
                />
              )}

              {outcomeType === 'FREE_RESPONSE' && (
                <FreeResponseResolutionOrChance
                  className="self-end text-gray-600"
                  contract={contract}
                  truncate="long"
                />
              )}
              <ProbBar contract={contract} />
            </Col>
          )}
        </Row>
      </Col>
    </div>
  )
}

export function BinaryResolutionOrChance(props: {
  contract: BinaryContract
  large?: boolean
  className?: string
}) {
  const { contract, large, className } = props
  const { resolution } = contract
  const textColor = `text-${getColor(contract)}`

  return (
    <Col className={clsx(large ? 'text-4xl' : 'text-3xl', className)}>
      {resolution ? (
        <>
          <div
            className={clsx('text-gray-500', large ? 'text-xl' : 'text-base')}
          >
            Resolved
          </div>
          <BinaryContractOutcomeLabel
            contract={contract}
            resolution={resolution}
          />
        </>
      ) : (
        <>
          <div className={textColor}>{getBinaryProbPercent(contract)}</div>
          <div className={clsx(textColor, large ? 'text-xl' : 'text-base')}>
            chance
          </div>
        </>
      )}
    </Col>
  )
}

function FreeResponseTopAnswer(props: {
  contract: FreeResponseContract
  truncate: 'short' | 'long' | 'none'
  className?: string
}) {
  const { contract, truncate } = props

  const topAnswer = getTopAnswer(contract)

  return topAnswer ? (
    <AnswerLabel
      className="!text-gray-600"
      answer={topAnswer}
      truncate={truncate}
    />
  ) : null
}

export function FreeResponseResolutionOrChance(props: {
  contract: FreeResponseContract | MultipleChoiceContract
  truncate: 'short' | 'long' | 'none'
  className?: string
}) {
  const { contract, truncate, className } = props
  const { resolution } = contract

  const topAnswer = getTopAnswer(contract)
  const textColor = `text-${getColor(contract)}`

  return (
    <Col className={clsx(resolution ? 'text-3xl' : 'text-xl', className)}>
      {resolution ? (
        <>
          <div className={clsx('text-base text-gray-500 sm:hidden')}>
            Resolved
          </div>
          {(resolution === 'CANCEL' || resolution === 'MKT') && (
            <FreeResponseOutcomeLabel
              contract={contract}
              resolution={resolution}
              truncate={truncate}
              answerClassName="text-3xl uppercase text-blue-500"
            />
          )}
        </>
      ) : (
        topAnswer && (
          <Row className="items-center gap-6">
            <Col className={clsx('text-3xl', textColor)}>
              <div>
                {formatPercent(getOutcomeProbability(contract, topAnswer.id))}
              </div>
              <div className="text-base">chance</div>
            </Col>
          </Row>
        )
      )}
    </Col>
  )
}

export function NumericResolutionOrExpectation(props: {
  contract: NumericContract
  className?: string
}) {
  const { contract, className } = props
  const { resolution } = contract
  const textColor = `text-${getColor(contract)}`

  const resolutionValue =
    contract.resolutionValue ?? getValueFromBucket(resolution ?? '', contract)

  return (
    <Col className={clsx(resolution ? 'text-3xl' : 'text-xl', className)}>
      {resolution ? (
        <>
          <div className={clsx('text-base text-gray-500')}>Resolved</div>

          {resolution === 'CANCEL' ? (
            <CancelLabel />
          ) : (
            <div className="text-blue-400">
              {formatLargeNumber(resolutionValue)}
            </div>
          )}
        </>
      ) : (
        <>
          <div className={clsx('text-3xl', textColor)}>
            {formatLargeNumber(getExpectedValue(contract))}
          </div>
          <div className={clsx('text-base', textColor)}>expected</div>
        </>
      )}
    </Col>
  )
}

export function PseudoNumericResolutionOrExpectation(props: {
  contract: PseudoNumericContract
  className?: string
}) {
  const { contract, className } = props
  const { resolution, resolutionValue, resolutionProbability } = contract
  const textColor = `text-blue-400`

  return (
    <Col className={clsx(resolution ? 'text-3xl' : 'text-xl', className)}>
      {resolution ? (
        <>
          <div className={clsx('text-base text-gray-500')}>Resolved</div>

          {resolution === 'CANCEL' ? (
            <CancelLabel />
          ) : (
            <div className="text-blue-400">
              {resolutionValue
                ? formatLargeNumber(resolutionValue)
                : formatNumericProbability(
                    resolutionProbability ?? 0,
                    contract
                  )}
            </div>
          )}
        </>
      ) : (
        <>
          <div className={clsx('text-3xl', textColor)}>
            {formatNumericProbability(getProbability(contract), contract)}
          </div>
          <div className={clsx('text-base', textColor)}>expected</div>
        </>
      )}
    </Col>
  )
}
