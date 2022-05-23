import clsx from 'clsx'
import Link from 'next/link'
import { Row } from '../layout/row'
import { formatLargeNumber, formatPercent } from 'common/util/format'
import {
  Contract,
  contractPath,
  getBinaryProbPercent,
  getBinaryProb,
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
  FreeResponseOutcomeLabel,
  OUTCOME_TO_COLOR,
} from '../outcome-label'
import { getOutcomeProbability, getTopAnswer } from 'common/calculate'
import { AbbrContractDetails } from './contract-details'
import { getExpectedValue, getValueFromBucket } from 'common/calculate-dpm'

// Return a number from 0 to 1 for this contract
// Resolved contracts are set to 1, for coloring purposes (even if NO)
function getProb(contract: Contract) {
  const { outcomeType, resolution } = contract
  return resolution
    ? 1
    : outcomeType === 'BINARY'
    ? getBinaryProb(contract)
    : outcomeType === 'FREE_RESPONSE'
    ? getOutcomeProbability(contract, getTopAnswer(contract)?.id || '')
    : outcomeType === 'NUMERIC'
    ? getNumericScale(contract as NumericContract)
    : 1 // Should not happen
}

function getNumericScale(contract: NumericContract) {
  const { min, max } = contract
  const ev = getExpectedValue(contract)
  return (ev - min) / (max - min)
}

function getColor(contract: Contract) {
  const { resolution } = contract
  if (resolution) {
    return (
      // @ts-ignore; TODO: Have better typing for contract.resolution?
      OUTCOME_TO_COLOR[resolution] ||
      // If resolved to a FR answer, use 'primary'
      'primary'
    )
  }
  if (contract.outcomeType === 'NUMERIC') {
    return 'blue-400'
  }

  const marketClosed = (contract.closeTime || Infinity) < Date.now()
  return marketClosed
    ? 'gray-400'
    : getProb(contract) >= 0.5
    ? 'primary'
    : 'red-400'
}

export function ContractCard(props: {
  contract: Contract
  showHotVolume?: boolean
  showCloseTime?: boolean
  className?: string
}) {
  const { contract, showHotVolume, showCloseTime, className } = props
  const { question, outcomeType } = contract

  const prob = getProb(contract)
  const color = getColor(contract)
  const marketClosed = (contract.closeTime || Infinity) < Date.now()
  const showTopBar = prob >= 0.5 || marketClosed

  return (
    <div>
      <Col
        className={clsx(
          'relative gap-3 rounded-lg bg-white p-6 pr-7 shadow-md hover:bg-gray-100',
          className
        )}
      >
        <Link href={contractPath(contract)}>
          <a className="absolute left-0 right-0 top-0 bottom-0" />
        </Link>

        <AbbrContractDetails
          contract={contract}
          showHotVolume={showHotVolume}
          showCloseTime={showCloseTime}
        />

        <Row className={clsx('justify-between gap-4')}>
          <Col className="gap-3">
            <p
              className="break-words font-medium text-indigo-700"
              style={{ /* For iOS safari */ wordBreak: 'break-word' }}
            >
              {question}
            </p>
          </Col>
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
        </Row>

        {outcomeType === 'FREE_RESPONSE' && (
          <FreeResponseResolutionOrChance
            className="self-end text-gray-600"
            contract={contract as FullContract<DPM, FreeResponse>}
            truncate="long"
          />
        )}

        <div
          className={clsx(
            'absolute right-0 top-0 w-2 rounded-tr-md',
            'bg-gray-200'
          )}
          style={{ height: `${100 * (1 - prob)}%` }}
        ></div>
        <div
          className={clsx(
            'absolute right-0 bottom-0 w-2 rounded-br-md',
            `bg-${color}`,
            // If we're showing the full bar, also round the top
            prob === 1 ? 'rounded-tr-md' : ''
          )}
          style={{ height: `${100 * prob}%` }}
        ></div>
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
          <div className={clsx('text-base text-gray-500')}>Resolved</div>
          <FreeResponseOutcomeLabel
            contract={contract}
            resolution={resolution}
            truncate={truncate}
            answerClassName="text-xl"
          />
        </>
      ) : (
        topAnswer && (
          <Row className="items-center gap-6">
            <AnswerLabel
              className="!text-gray-600"
              answer={topAnswer}
              truncate={truncate}
            />
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

  const resolutionValue =
    contract.resolutionValue ?? getValueFromBucket(resolution ?? '', contract)

  return (
    <Col className={clsx(resolution ? 'text-3xl' : 'text-xl', className)}>
      {resolution ? (
        <>
          <div className={clsx('text-base text-gray-500')}>Resolved</div>
          <div className="text-blue-400">{resolutionValue}</div>
        </>
      ) : (
        <>
          <div className="text-3xl text-blue-400">
            {formatLargeNumber(getExpectedValue(contract))}
          </div>
          <div className="text-base text-blue-400">expected</div>
        </>
      )}
    </Col>
  )
}
