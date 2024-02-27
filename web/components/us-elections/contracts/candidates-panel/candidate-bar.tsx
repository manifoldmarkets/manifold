import clsx from 'clsx'
import { Answer } from 'common/answer'
import { CPMMMultiContract, MultiContract, contractPath } from 'common/contract'
import Image from 'next/image'
import { useRouter } from 'next/router'
import { IoIosPerson } from 'react-icons/io'
import { MultiBettor, OpenProb } from 'web/components/answers/answer-components'
import { ClickFrame } from 'web/components/widgets/click-frame'
import { CANDIDATE_DATA } from '../../ candidates/candidate-data'
import { Col } from '../../../layout/col'
import { Row } from '../../../layout/row'

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
  const router = useRouter()
  return (
    <>
      {/* <Link
        href={contractPath(contract)}
        onPointerOver={onHover && (() => onHover(true))}
        onPointerLeave={onHover && (() => onHover(false))}
        className={clsx(
          ' bg-canvas-0 relative h-40 w-[112px] justify-between overflow-hidden rounded transition-all',
          className
        )}
      > */}
      <ClickFrame
        onClick={() => {
          router.push(contractPath(contract))
        }}
        // onPointerOver={onHover && (() => onHover(true))}
        // onPointerLeave={onHover && (() => onHover(false))}
        className={clsx(
          ' bg-canvas-0 relative h-40 w-[112px] justify-between overflow-hidden rounded transition-all',
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
              <OpenProb contract={contract} answer={answer} />
              <MultiBettor
                contract={contract as CPMMMultiContract}
                answer={answer as Answer}
              />
            </Row>
            <div className="sm:text-md w-full text-sm">
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
      </ClickFrame>
      {/* </Link> */}
    </>
  )
}
