import { RangeSlider } from '../widgets/slider'
import { ScaleTime } from 'd3-scale'
import { formatDateInRange } from './helpers'
import clsx from 'clsx'
import { useMemo } from 'react'

// assumes x is time and we're zooming over a time period
export const ZoomSlider = (props: {
  fullScale: ScaleTime<number, number>
  visibleScale: ScaleTime<number, number>
  setVisibleScale: (newScale: ScaleTime<number, number>) => void
  className?: string
}) => {
  const { fullScale, visibleScale, setVisibleScale, className } = props
  const [min, max] = fullScale.domain()
  const [low, hi] = visibleScale.domain()

  const now = useMemo(() => new Date(), [])

  return (
    <div className={clsx('flex w-full items-center py-1 text-xs', className)}>
      {formatDateInRange(min, min, max)}
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
        className="flex h-auto grow items-center px-4"
        color="light"
      />
      {formatDateInRange(max, min, now)}
    </div>
  )
}
