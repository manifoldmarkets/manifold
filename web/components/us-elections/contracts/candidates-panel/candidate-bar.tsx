import { SparklesIcon } from '@heroicons/react/solid'
import { animated } from '@react-spring/web'
import clsx from 'clsx'
import { Answer, DpmAnswer } from 'common/answer'
import { getAnswerProbability } from 'common/calculate'
import { CPMMMultiContract, MultiContract } from 'common/contract'
import { formatPercent } from 'common/util/format'
import { HOUR_MS } from 'common/util/time'
import Image from 'next/image'
import { useState } from 'react'
import { AnswerCpmmBetPanel } from 'web/components/answers/answer-bet-panel'
import { useAnimatedNumber } from 'web/hooks/use-animated-number'
import { useUser } from 'web/hooks/use-user'
import { CANDIDATE_DATA } from '../../ candidates/candidate-data'
import { Col } from '../../../layout/col'
import { MODAL_CLASS, Modal } from '../../../layout/modal'
import { Row } from '../../../layout/row'
import { Tooltip } from '../../../widgets/tooltip'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { IoIosPerson } from 'react-icons/io'

export const CandidateBar = (props: {
  color: string // 6 digit hex
  prob: number // 0 - 1
  resolvedProb?: number // 0 - 1
  className?: string
  hideBar?: boolean
  onHover?: (hovering: boolean) => void
  answer: Answer
  selected?: boolean
  contract: MultiContract
}) => {
  const {
    color,
    prob,
    resolvedProb,
    className,
    hideBar,
    onHover,
    answer,
    selected,
    contract,
  } = props

  const candidateImage = CANDIDATE_DATA[answer.text]?.photo
  const [open, setOpen] = useState(false)
  const user = useUser()
  const isMobile = useIsMobile()
  return (
    <>
      <Col
        className={clsx(
          'border-ink-200 hover:border-primary-600 border-1 relative w-[11rem] overflow-hidden rounded-md border-2 transition-all sm:w-[220px]',
          className
        )}
        onPointerOver={onHover && (() => onHover(true))}
        onPointerLeave={onHover && (() => onHover(false))}
        onClick={() => setOpen(true)}
      >
        <Row className="my-auto h-full items-center justify-between gap-x-4 pr-4 leading-none">
          {!candidateImage ? (
            <IoIosPerson className="text-ink-600 -mb-4 h-20 w-20 sm:h-24 sm:w-24" />
          ) : (
            <Image
              src={candidateImage}
              alt={answer.text}
              width={isMobile ? 64 : 80}
              height={isMobile ? 64 : 80}
              className="object-fill"
            />
          )}
          <Col>
            <Row className="w-full justify-end">
              <CandidateProb contract={contract} answer={answer} />
            </Row>
            <Row className="w-full justify-end text-sm sm:text-lg">
              {CANDIDATE_DATA[answer.text]?.shortName ?? answer.text}
            </Row>
          </Col>
        </Row>
        <div
          className={clsx(
            'bg-canvas-0 absolute bottom-0 left-0 right-0 top-0 -z-10 rounded transition-all'
          )}
        >
          {/* bar outline if resolved */}
          {!!resolvedProb && !hideBar && (
            <div
              className={clsx(
                'absolute bottom-0 w-full rounded ring-1 ring-purple-500 sm:ring-2',
                resolvedProb > prob
                  ? 'bg-purple-100 dark:bg-purple-900'
                  : 'z-10'
              )}
              style={{
                height: `${resolvedProb * 100}%`,
              }}
            />
          )}
          {/* main bar */}
          {!hideBar && (
            <Col className="h-full w-full justify-end">
              <div
                className="w-full dark:brightness-75"
                style={{
                  height: `max(1px, ${prob * 100}%)`,
                  background: color,
                }}
              />
            </Col>
          )}
        </div>
      </Col>
      <Modal open={open} setOpen={setOpen} className={MODAL_CLASS}>
        <AnswerCpmmBetPanel
          answer={answer}
          contract={contract as CPMMMultiContract}
          outcome={'YES'}
          closePanel={() => {}}
          me={user}
        />
      </Modal>
    </>
  )
}

export const CandidateProb = (props: {
  contract: MultiContract
  answer: Answer | DpmAnswer
}) => {
  const { contract, answer } = props
  const spring = useAnimatedNumber(getAnswerProbability(contract, answer.id))
  const cutoffTime = Date.now() - 6 * HOUR_MS
  const isNew =
    contract.createdTime < cutoffTime && answer.createdTime > cutoffTime
  return (
    <Row className={'items-center'}>
      <span
        className={clsx(
          ' min-w-[2.5rem] whitespace-nowrap text-lg font-bold sm:text-2xl'
        )}
      >
        <animated.div>{spring.to((val) => formatPercent(val))}</animated.div>
      </span>
      {isNew && (
        <Tooltip text={'Recently submitted'}>
          <SparklesIcon className="h-4 w-4 text-green-500" />
        </Tooltip>
      )}
    </Row>
  )
}
