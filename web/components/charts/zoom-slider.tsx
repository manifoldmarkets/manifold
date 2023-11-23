import { RangeSlider } from '../widgets/slider'
import { ZoomParams, formatDateInRange } from './helpers'
import clsx from 'clsx'
import { useMemo } from 'react'
import { Col } from '../layout/col'
import { Row } from '../layout/row'

// assumes x is time and we're zooming over a time period
export const ZoomSlider = (props: {
  zoomParams: ZoomParams
  className?: string
  color?: 'light-green' | 'indigo'
}) => {
  const { zoomParams, className, color } = props
  const { xScale, viewXScale, rescaleBetween } = zoomParams
  const [min, max] = xScale.domain()
  const [low, hi] = viewXScale.domain()

  const now = useMemo(() => new Date(), [])

  return (
    <Col className={clsx('w-full items-stretch', className)}>
      <RangeSlider
        lowValue={low.valueOf()}
        highValue={hi.valueOf()}
        min={min.valueOf()}
        max={max.valueOf()}
        setValues={rescaleBetween}
        color={color}
      />
      <Row className="justify-between text-xs">
        <div>{formatDateInRange(min, min, max)}</div>
        <div>{formatDateInRange(max, min, now)}</div>
      </Row>
    </Col>
  )
}
