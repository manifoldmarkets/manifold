import clsx from 'clsx'
import Link from 'next/link'
import { Row } from '../layout/row'
import { formatLargeNumber, formatPercent } from 'common/util/format'
import {
  Contract,
  contractPath,
  getBinaryProbPercent,
} from 'web/lib/firebase/contracts'
import { Col } from '../layout/col'
import {
  Binary,
  CPMM,
  DPM,
  FreeResponse,
  FreeResponseContract,
  FullContract,
  NumericContract,
} from 'common/contract'
import {
  AnswerLabel,
  BinaryContractOutcomeLabel,
  CancelLabel,
  FreeResponseOutcomeLabel,
} from '../outcome-label'
import { getOutcomeProbability, getTopAnswer } from 'common/calculate'
import { AvatarDetails, MiscDetails } from './contract-details'
import { getExpectedValue, getValueFromBucket } from 'common/calculate-dpm'
import { QuickBet, ProbBar, getColor } from './quick-bet'
import { useContractWithPreload } from 'web/hooks/use-contract'
import { useUser } from 'web/hooks/use-user'

export function ContractCard(props: {
  contract: Contract
  showHotVolume?: boolean
  showCloseTime?: boolean
  className?: string
}) {
  const { showHotVolume, showCloseTime, className } = props
  const contract = useContractWithPreload(props.contract) ?? props.contract
  const { question, outcomeType } = contract
  const { resolution } = contract

  const user = useUser()

  const marketClosed =
    (contract.closeTime || Infinity) < Date.now() || !!resolution

  const showQuickBet = !(
    !user ||
    marketClosed ||
    (outcomeType === 'FREE_RESPONSE' && getTopAnswer(contract) === undefined) ||
    outcomeType === 'NUMERIC'
  )

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
              <Link href={contractPath(contract)}>
                <a className="absolute top-0 left-0 right-0 bottom-0" />
              </Link>
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
                  contract={contract as FreeResponseContract}
                  resolution={resolution}
                  truncate={'long'}
                />
              ) : (
                <FreeResponseTopAnswer
                  contract={contract as FullContract<DPM, FreeResponse>}
                  truncate="long"
                />
              ))}

            <MiscDetails
              contract={contract}
              showHotVolume={showHotVolume}
              showCloseTime={showCloseTime}
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

              {outcomeType === 'NUMERIC' && (
                <NumericResolutionOrExpectation
                  className="items-center"
                  contract={contract as NumericContract}
                />
              )}

              {outcomeType === 'FREE_RESPONSE' && (
                <FreeResponseResolutionOrChance
                  className="self-end text-gray-600"
                  contract={contract as FullContract<DPM, FreeResponse>}
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
  contract: FullContract<DPM | CPMM, Binary>
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
  contract: FreeResponseContract
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
            <div className="text-blue-400">{resolutionValue}</div>
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
