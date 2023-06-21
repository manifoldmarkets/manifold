import clsx from 'clsx'


import Slider from 'rc-slider'
import { useEffect, useRef, useState } from 'react'
import { useWindowSize } from 'web/hooks/use-window-size'
import { Col } from '../layout/col'
import { Row } from '../layout/row'

export function convertNumberToProb(
  number: number,
  isPseudoNumeric: boolean,
  min_prob: number,
  max_prob: number
) {
  if (isPseudoNumeric) {
    return ((number - min_prob) / (max_prob - min_prob)) * 100
  }
  return number
}

export function LimitSlider(props: {
  isPseudoNumeric: boolean
  lowLimitProb: number
  setLowLimitProb: (prob: number) => void
  highLimitProb: number
  setHighLimitProb: (prob: number) => void
  max_prob: number
  min_prob: number
  mobileView?: boolean
}) {
  const {
    isPseudoNumeric,
    lowLimitProb,
    setLowLimitProb,
    highLimitProb,
    setHighLimitProb,
    max_prob,
    min_prob,
    mobileView,
  } = props

  const mark = (value: number) => (
    <span className="text-ink-400 text-xs">
      <div className={'sm:h-0.5'} />
      {value}%
    </span>
  )

  const targetRef = useRef<HTMLDivElement>(null)
  const [sliderWidth, setSliderWidth] = useState(0)
  const window = useWindowSize()
  useEffect(() => {
    if (targetRef.current) {
      setSliderWidth(targetRef.current.offsetWidth)
    }
  }, [window.width])

  const lowLimitPosition =
    sliderWidth *
    (convertNumberToProb(lowLimitProb, isPseudoNumeric, min_prob, max_prob) /
      100)
  const highLimitPosition =
    sliderWidth *
    (convertNumberToProb(highLimitProb, isPseudoNumeric, min_prob, max_prob) /
      100)
  const LIMIT_LABEL_MIN_DISTANCE = 130
  return (
    <Col className="mb-8">
      <Row className="mt-1 mb-4 gap-4">
        <Col className="w-full">
          <div className="text-ink-800 text-sm">
            Attempt to keep between {isPseudoNumeric ? '' : 'probabilities'}:
          </div>
          <Row
            className="relative h-12 grow items-center gap-4"
            ref={targetRef}
          >
            <div
              className={clsx(
                'absolute bottom-0 w-16 select-none rounded p-1 px-2 text-center text-lg',
                lowLimitProb === undefined || lowLimitProb === min_prob
                  ? 'bg-ink-300 text-ink-600 opacity-40'
                  : lowLimitProb == highLimitProb
                  ? 'bg-red-400 bg-opacity-20 text-red-500'
                  : 'bg-canvas-0'
              )}
              style={{
                left: `${
                  highLimitPosition - lowLimitPosition <
                  LIMIT_LABEL_MIN_DISTANCE
                    ? `calc(${convertNumberToProb(
                        lowLimitProb,
                        isPseudoNumeric,
                        min_prob,
                        max_prob
                      )}%-${
                        LIMIT_LABEL_MIN_DISTANCE -
                        (highLimitPosition - lowLimitPosition)
                      }px)`
                    : `${convertNumberToProb(
                        lowLimitProb,
                        isPseudoNumeric,
                        min_prob,
                        max_prob
                      )}%`
                }`,
              }}
            >
              {lowLimitProb}{' '}
              {!isPseudoNumeric && <span className="text-sm">%</span>}
            </div>
            <div
              className={clsx(
                'absolute bottom-0 w-16 select-none rounded p-1 px-2 text-center text-lg',
                highLimitProb === undefined || highLimitProb === max_prob
                  ? 'bg-ink-300 text-ink-600 opacity-40'
                  : lowLimitProb == highLimitProb
                  ? 'bg-red-400 bg-opacity-20 text-red-500'
                  : 'bg-canvas-0'
              )}
              style={{
                right: `${
                  highLimitPosition - lowLimitPosition <
                  LIMIT_LABEL_MIN_DISTANCE
                    ? `calc((100% - ${convertNumberToProb(
                        highLimitProb,
                        isPseudoNumeric,
                        min_prob,
                        max_prob
                      )}%)-${
                        LIMIT_LABEL_MIN_DISTANCE -
                        (highLimitPosition - lowLimitPosition)
                      }px)`
                    : `${
                        100 -
                        (convertNumberToProb(
                          highLimitProb,
                          isPseudoNumeric,
                          min_prob,
                          max_prob
                        ) ?? 0)
                      }%`
                }`,
              }}
            >
              {highLimitProb}
              {!isPseudoNumeric && <span className="text-sm">%</span>}
            </div>
          </Row>
        </Col>
        <Row
          className={clsx(
            mobileView ? 'hidden' : 'hidden sm:flex',
            'ml-auto gap-4 self-start'
          )}
        ></Row>
      </Row>
      <Row>
        <Slider
          range
          marks={
            isPseudoNumeric
              ? undefined
              : {
                  0: mark(min_prob),
                  50: mark(50),
                  100: mark(max_prob),
                }
          }
          value={[lowLimitProb, highLimitProb]}
          min={min_prob}
          max={max_prob}
          onChange={(value) => {
            if (value && Array.isArray(value) && value.length > 1) {
              setLowLimitProb(value[0])
              setHighLimitProb(value[1])
            }
          }}
          className={clsx(
            '[&>.rc-slider-rail]:bg-ink-200 my-auto mx-2  !h-1 xl:mx-2 ',
            '[&>.rc-slider-handle]:z-10',
            '[&>.rc-slider-handle]:bg-primary-500 [&>.rc-slider-track]:bg-primary-300'
          )}
          handleStyle={{
            height: 20,
            width: 20,
            opacity: 1,
            border: 'none',
            boxShadow: 'none',
            top: 2,
          }}
          allowCross={false}
        />
      </Row>
    </Col>
  )
}
