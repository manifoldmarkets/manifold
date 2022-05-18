import clsx from 'clsx'
import Link from 'next/link'
import _ from 'lodash'
import { Row } from '../layout/row'
import { formatPercent } from 'common/util/format'
import {
  Contract,
  contractPath,
  getBinaryProbPercent,
} from 'web/lib/firebase/contracts'
import { Col } from '../layout/col'
import { Spacer } from '../layout/spacer'
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
} from '../outcome-label'
import { getOutcomeProbability, getTopAnswer } from 'common/calculate'
import { AbbrContractDetails } from './contract-details'
import { getValueFromBucket } from 'common/calculate-dpm'

export function ContractCard(props: {
  contract: Contract
  showHotVolume?: boolean
  showCloseTime?: boolean
  className?: string
}) {
  const { contract, showHotVolume, showCloseTime, className } = props
  const { question, outcomeType, resolution } = contract

  return (
    <div>
      <div
        className={clsx(
          'relative rounded-lg bg-white p-6 shadow-md hover:bg-gray-100',
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
        <Spacer h={3} />

        <Row
          className={clsx(
            'justify-between gap-4',
            outcomeType === 'FREE_RESPONSE' && 'flex-col items-start !gap-2'
          )}
        >
          <p
            className="break-words font-medium text-indigo-700"
            style={{ /* For iOS safari */ wordBreak: 'break-word' }}
          >
            {question}
          </p>
          {outcomeType === 'BINARY' && (
            <BinaryResolutionOrChance
              className="items-center"
              contract={contract}
            />
          )}
          {outcomeType === 'FREE_RESPONSE' && (
            <FreeResponseResolutionOrChance
              className="self-end text-gray-600"
              contract={contract as FullContract<DPM, FreeResponse>}
              truncate="long"
            />
          )}
        </Row>
      </div>
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

  const marketClosed = (contract.closeTime || Infinity) < Date.now()
  const probColor = marketClosed ? 'text-gray-400' : 'text-primary'

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
          <div className={probColor}>{getBinaryProbPercent(contract)}</div>
          <div className={clsx(probColor, large ? 'text-xl' : 'text-base')}>
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
            <Col className="text-primary text-3xl">
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

export function NumericResolution(props: {
  contract: NumericContract
  className?: string
}) {
  const { contract, className } = props
  const { resolution } = contract

  const resolutionValue = getValueFromBucket(resolution ?? '', contract)

  return (
    <Col className={clsx(resolution ? 'text-3xl' : 'text-xl', className)}>
      <div className={clsx('text-base text-gray-500')}>Resolved</div>
      <div className="text-blue-400">{resolutionValue}</div>
    </Col>
  )
}
