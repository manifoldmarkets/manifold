import { animated } from '@react-spring/web'
import clsx from 'clsx'
import { Answer, DpmAnswer } from 'common/answer'
import { getAnswerProbability } from 'common/calculate'
import { CPMMMultiContract, MultiContract, contractPath } from 'common/contract'
import { formatPercent } from 'common/util/format'
import Image from 'next/image'
import Link from 'next/link'
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
import { Button } from 'politics/components/button/button'
import { AnimatedProb } from '../party-panel/party-bar'
import { MultiBettor } from 'politics/components/answers/answer-components'

export function removeTextInParentheses(input: string): string {
  return input.replace(/\s*\([^)]*\)/g, '')
}

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

  const candidatefullName = removeTextInParentheses(answer.text)

  const { shortName, photo } = CANDIDATE_DATA[candidatefullName] ?? {}

  return (
    <>
      <Link
        href={contractPath(contract)}
        onPointerOver={onHover && (() => onHover(true))}
        onPointerLeave={onHover && (() => onHover(false))}
        className={clsx(
          ' border-ink-100 bg-canvas-0 hover:border-ink-1000 relative h-40 w-[112px] justify-between overflow-hidden border-[1.5px] transition-all',
          className
        )}
      >
        <div className={clsx(' transition-all')}>
          {/* bar outline if resolved */}
          {!!resolvedProb && !hideBar && (
            <div
              className={clsx(
                'absolute bottom-0 w-full ring-1 ring-orange-500 sm:ring-2',
                resolvedProb > prob
                  ? 'bg-orange-100 dark:bg-orange-900'
                  : 'z-10'
              )}
              style={{
                height: `${resolvedProb * 100}%`,
              }}
            />
          )}
          {/* main bar */}
          {!hideBar && (
            <Col className="absolute h-full w-full justify-end">
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
        <Col className="absolute inset-0">
          <Col className="mt-2 px-2">
            <Row className="w-full items-center justify-between">
              <AnimatedProb contract={contract} answer={answer} size="md" />
              <MultiBettor
                contract={contract as CPMMMultiContract}
                answer={answer as Answer}
              />
            </Row>
            <div className="sm:text-md w-full font-mono text-sm">
              {shortName ?? answer.text}
            </div>
          </Col>
          {!photo ? (
            <IoIosPerson className="text-ink-600 -mb-4 h-[112px] w-[112px]" />
          ) : (
            <Image
              src={photo}
              alt={candidatefullName}
              width={112}
              height={112}
              className="mx-auto object-fill"
            />
          )}
        </Col>
      </Link>
    </>
  )
}
