import { RangeSlider } from '../widgets/slider'
import { ScaleTime } from 'd3-scale'
import { formatDateInRange } from './helpers'
import clsx from 'clsx'
import { useMemo } from 'react'
import { Col } from '../layout/col'
import { Row } from '../layout/row'

// assumes x is time and we're zooming over a time period
export const ZoomSlider = (props: {
  fullScale: ScaleTime<number, number>
  visibleScale: ScaleTime<number, number>
  setVisibleScale: (newScale: ScaleTime<number, number>) => void
  className?: string
  color?: 'light-green' | 'indigo'
}) => {
  const { fullScale, visibleScale, setVisibleScale, className, color } = props
  const [min, max] = fullScale.domain()
  const [low, hi] = visibleScale.domain()

  const now = useMemo(() => new Date(), [])

  return (
    <Col className={clsx('w-full items-stretch', className)}>
      <RangeSlider
        lowValue={low.valueOf()}
        highValue={hi.valueOf()}
        min={min.valueOf()}
        max={max.valueOf()}
        setValues={(newLow, newHigh) =>
          setVisibleScale(
            fullScale.copy().domain([new Date(newLow), new Date(newHigh)])
          )
        }
        color={color}
      />
      <Row className="justify-between text-xs">
        <div>{formatDateInRange(min, min, max)}</div>
        <div>{formatDateInRange(max, min, now)}</div>
      </Row>
    </Col>
  )
}
