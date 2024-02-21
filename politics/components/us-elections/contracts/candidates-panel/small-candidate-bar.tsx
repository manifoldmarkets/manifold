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
import { AnimatedProb } from '../../../widgets/animated-prob'
import { Button } from 'politics/components/button/button'
import { MultiBettor } from 'politics/components/answers/answer-components'

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

  const isMobile = useIsMobile()

  const { shortName, photo } = CANDIDATE_DATA[candidatefullName] ?? {}

  return (
    <>
      <Col className={clsx('relative isolate h-full w-full', className)}>
        <Row className="my-auto h-full items-center justify-between gap-x-4 pr-4 leading-none">
          <Row className="w-full items-center gap-2 font-mono text-sm sm:text-lg">
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
          <Row className="items-center gap-1 sm:gap-2">
            <AnimatedProb contract={contract} answer={answer} align="right" />
            <MultiBettor
              contract={contract as CPMMMultiContract}
              answer={answer as Answer}
            />
          </Row>
        </Row>
        <div
          className={clsx(
            'absolute bottom-0 left-0 right-0 -z-10 h-full  transition-all ',
            hideBar ? 'bg-ink-200' : 'bg-canvas-50'
          )}
        >
          {/* bar outline if resolved */}
          {!!resolvedProb && !hideBar && (
            <div
              className={clsx(
                'absolute top-0 h-full  ring-1 ring-orange-500 sm:ring-2',
                resolvedProb > prob
                  ? 'bg-orange-100 dark:bg-orange-900'
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
              className="isolate h-full dark:brightness-75"
              style={{
                width: `max(8px, ${prob * 100}%)`,
                background: color,
              }}
            />
          )}
        </div>
      </Col>
    </>
  )
}
