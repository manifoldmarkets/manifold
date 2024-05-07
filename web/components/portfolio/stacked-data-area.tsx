import { CurveFactory } from 'd3-shape'
import { useId, useMemo } from 'react'
import { DiagonalPattern } from '../charts/generic-charts'
import { AreaPath } from '../charts/helpers'
import { PortfolioHoveredGraphType } from './portfolio-value-section'
import { create } from 'domain'

export function StackedArea<P>(props: {
  id: string
  points: P[]
  unstackedPoints: P[]
  color: string
  index: number
  xScale: (x: number) => number
  yScale: (y: number) => number
  stackedData: { points: P[]; color: string; id: string }[]
  curve: CurveFactory
  onClick: () => void
  onMouseEnter: () => void
  onMouseLeave: () => void
  portfolioHoveredGraph: PortfolioHoveredGraphType
  w: number
}) {
  const {
    id,
    points,
    color,
    index,
    xScale,
    yScale,
    stackedData,
    curve,
    onClick,
    onMouseEnter,
    onMouseLeave,
    portfolioHoveredGraph,
    unstackedPoints,
    w,
  } = props

  const createAreaData = (points: P[], y0Calculator: (idx: number) => void) =>
    points.map((point, idx) => ({
      x: point.x,
      y0: y0Calculator(idx),
      y1: point.y,
    }))

  const negativePatternId = useId()
  const { points: previousPoints } =
    index >= 0 ? stackedData[index - 1] : { points: undefined }

  const { positiveData, negativeData } = useMemo(() => {
    const positivePoints: P[] = []
    const negativePoints: P[] = []

    points.forEach((point, index) => {
      const isNegative = unstackedPoints[index] && unstackedPoints[index].y < 0
      if (isNegative) {
        negativePoints.push(point)
      } else {
        positivePoints.push(point)
      }
    })

    // Create separate datasets for positive and negative areas
    return {
      positiveData: createAreaData(positivePoints, (idx) =>
        previousPoints ? previousPoints[idx].y : 0
      ),
      negativeData: createAreaData(negativePoints, (idx) =>
        previousPoints ? previousPoints[idx].y : 0
      ),
    }
  }, [points, unstackedPoints, color, negativePatternId])
  return (
    <>
      <defs>
        <DiagonalPattern id={negativePatternId} color={color} size={2} />
      </defs>
      <AreaPath
        data={positiveData}
        px={(p) => xScale(p.x)}
        py0={(p) => yScale(p.y0)}
        py1={(p) => yScale(p.y1)}
        curve={curve}
        fill={color}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onClick={onClick}
        className="transition-opacity"
        opacity={portfolioHoveredGraph == id ? 1 : 0.85}
      />
      <AreaPath
        data={negativeData}
        px={(p) => xScale(p.x)}
        py0={(p) => yScale(p.y0)}
        py1={(p) => yScale(p.y1)}
        curve={curve}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onClick={onClick}
        fill={index == 0 ? color : `url(#${negativePatternId})`}
        className="transition-opacity"
        opacity={portfolioHoveredGraph == id ? 1 : 0.85}
      />
    </>
  )
}
