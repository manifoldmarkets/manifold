import { animated } from '@react-spring/web'
import clsx from 'clsx'
import { Answer, DpmAnswer } from 'common/answer'
import { getAnswerProbability } from 'common/calculate'
import { CPMMMultiContract, MultiContract } from 'common/contract'
import { formatPercent } from 'common/util/format'
import Image from 'next/image'
import { MouseEventHandler, useState } from 'react'
import { IoIosPerson } from 'react-icons/io'
import { AnswerCpmmBetPanel } from 'web/components/answers/answer-bet-panel'
import { useAnimatedNumber } from 'web/hooks/use-animated-number'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useUser } from 'web/hooks/use-user'
import { CANDIDATE_DATA } from '../../candidates/candidate-data'
import { Col } from 'web/components/layout/col'
import { MODAL_CLASS, Modal } from 'web/components/layout/modal'
import { Row } from 'web/components/layout/row'
import { removeTextInParentheses } from './candidate-bar'

export const SmallCandidateBar = (props: {
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

  const candidatefullName = removeTextInParentheses(answer.text)
  const [open, setOpen] = useState(false)
  const user = useUser()
  const isMobile = useIsMobile()

  const { shortName, photo, party } = CANDIDATE_DATA[candidatefullName] ?? {}

  return (
    <>
      <Col className={clsx('relative isolate h-full w-full', className)}>
        <Row className="my-auto h-full items-center justify-between gap-x-4 pr-4 leading-none">
          <Row className="w-full items-center gap-2 text-sm sm:text-lg">
            {!photo ? (
              <IoIosPerson className="text-ink-600 h-10 w-10 sm:h-[60px] sm:w-[60px]" />
            ) : (
              <Image
                src={photo}
                alt={answer.text}
                width={isMobile ? 40 : 60}
                height={isMobile ? 40 : 60}
                className="object-fill"
              />
            )}

            {shortName ?? answer.text}
          </Row>
          <CandidateProb
            contract={contract}
            answer={answer}
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              setOpen(true)
            }}
          />
        </Row>
        <div
          className={clsx(
            'absolute bottom-0 left-0 right-0 -z-10 h-full rounded transition-all ',
            hideBar ? 'bg-ink-200' : 'bg-canvas-50'
          )}
        >
          {/* bar outline if resolved */}
          {!!resolvedProb && !hideBar && (
            <div
              className={clsx(
                'absolute top-0 h-full rounded ring-1 ring-purple-500 sm:ring-2',
                resolvedProb > prob
                  ? 'bg-purple-100 dark:bg-purple-900'
                  : 'z-10'
              )}
              style={{
                width: `${resolvedProb * 100}%`,
              }}
            />
          )}
          {/* main bar */}
          {!hideBar && (
            <div
              className="isolate h-full rounded dark:brightness-75"
              style={{
                width: `max(8px, ${prob * 100}%)`,
                background: color,
              }}
            />
          )}
        </div>
      </Col>
      <Modal open={open} setOpen={setOpen} className={MODAL_CLASS}>
        <AnswerCpmmBetPanel
          answer={answer}
          contract={contract as CPMMMultiContract}
          outcome={'YES'}
          closePanel={() => {
            setOpen(false)
          }}
          me={user}
        />
      </Modal>
    </>
  )
}

export const CandidateProb = (props: {
  contract: MultiContract
  answer: Answer | DpmAnswer
  onClick: MouseEventHandler<HTMLButtonElement>
}) => {
  const { contract, answer, onClick } = props
  const spring = useAnimatedNumber(getAnswerProbability(contract, answer.id))

  return (
    <button className={'items-center'} onClick={onClick}>
      <span
        className={clsx(
          ' hover:text-primary-700 min-w-[2.5rem] whitespace-nowrap text-lg font-bold sm:text-2xl'
        )}
      >
        <animated.div>{spring.to((val) => formatPercent(val))}</animated.div>
      </span>
    </button>
  )
}
