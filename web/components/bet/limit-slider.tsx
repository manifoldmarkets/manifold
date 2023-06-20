import clsx from 'clsx'
import {
  CPMMBinaryContract,
  CPMMMultiContract,
  PseudoNumericContract,
  StonkContract,
} from 'common/contract'
import Slider from 'rc-slider'
import { useEffect, useRef, useState } from 'react'
import { useWindowSize } from 'web/hooks/use-window-size'
import { Col } from '../layout/col'
import { Row } from '../layout/row'

export function LimitSlider(props: {
  lowLimitProb: number
  setLowLimitProb: (prob: number) => void
  highLimitProb: number
  setHighLimitProb: (prob: number) => void
  mobileView?: boolean
}) {
  const {
    lowLimitProb,
    setLowLimitProb,
    highLimitProb,
    setHighLimitProb,
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

  const lowLimitPosition = sliderWidth * ((lowLimitProb ?? 0) / 100)
  const highLimitPosition = sliderWidth * ((highLimitProb ?? 0) / 100)
  const LIMIT_LABEL_MIN_DISTANCE = 130
  return (
    <Col className="mb-8">
      <Row className="mt-1 mb-4 gap-4">
        <Col className="w-full">
          <div className="text-ink-800 text-sm">
            Attempt to keep between probabilities:
          </div>
          <Row
            className="relative h-12 grow items-center gap-4"
            ref={targetRef}
          >
            <div
              className={clsx(
                'absolute bottom-0 w-16 select-none rounded p-1 px-2 text-lg',
                lowLimitProb === undefined || lowLimitProb === 0
                  ? 'bg-ink-300 text-ink-600'
                  : 'bg-canvas-0'
              )}
              style={{
                left: `${
                  highLimitPosition - lowLimitPosition <
                  LIMIT_LABEL_MIN_DISTANCE
                    ? `calc(${lowLimitProb}-${
                        LIMIT_LABEL_MIN_DISTANCE -
                        (highLimitPosition - lowLimitPosition)
                      }px)`
                    : `${lowLimitProb}%`
                }`,
              }}
            >
              {lowLimitProb} <span className="text-sm">%</span>
            </div>
            <div
              className={clsx(
                'absolute bottom-0 w-16 select-none rounded p-1 px-2 text-lg',
                highLimitProb === undefined || highLimitProb === 100
                  ? 'bg-ink-300 text-ink-600'
                  : 'bg-canvas-0'
              )}
              style={{
                right: `${
                  highLimitPosition - lowLimitPosition <
                  LIMIT_LABEL_MIN_DISTANCE
                    ? `calc((100% - ${highLimitProb}%)-${
                        LIMIT_LABEL_MIN_DISTANCE -
                        (highLimitPosition - lowLimitPosition)
                      }px)`
                    : `${100 - (highLimitProb ?? 0)}%`
                }`,
              }}
            >
              {highLimitProb} <span className="text-sm">%</span>
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
          marks={{
            '0': mark(0),
            '50': mark(50),
            '100': mark(100),
          }}
          value={[lowLimitProb, highLimitProb]}
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
