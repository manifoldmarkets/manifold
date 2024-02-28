import clsx from 'clsx'
import { Answer } from 'common/answer'
import { CPMMMultiContract, MultiContract } from 'common/contract'
import Image from 'next/image'
import { IoIosPerson } from 'react-icons/io'
import { MultiBettor, OpenProb } from 'web/components/answers/answer-components'
import { CANDIDATE_DATA } from '../../ candidates/candidate-data'
import { Col } from '../../../layout/col'
import { Row } from '../../../layout/row'
import { PercentChangeToday, removeTextInParentheses } from './candidate-bar'

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

  const { shortName, photo } = CANDIDATE_DATA[candidatefullName] ?? {}

  return (
    <>
      <Col className={clsx('relative isolate h-full w-full', className)}>
        <Row className="my-auto h-full items-center justify-between gap-x-4 pr-4 leading-none">
          <Row className="w-full items-center gap-2">
            {!photo ? (
              <IoIosPerson className="text-ink-600 h-[60px] w-[60px] " />
            ) : (
              <Image
                src={photo}
                alt={answer.text}
                width={60}
                height={60}
                className="rounded-bl object-fill"
              />
            )}

            {shortName ?? answer.text}
          </Row>
          <Row className="items-center gap-1 sm:gap-2">
            <div className="relative">
              <OpenProb contract={contract} answer={answer} />
              <PercentChangeToday
                probChange={answer.probChanges.day}
                className="absolute right-1 top-6 whitespace-nowrap text-xs"
              />
            </div>
            <MultiBettor
              contract={contract as CPMMMultiContract}
              answer={answer as Answer}
            />
          </Row>
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
                'absolute top-0 h-full rounded ring-1 ring-orange-500 sm:ring-2',
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
              className="isolate h-full rounded dark:brightness-75"
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
