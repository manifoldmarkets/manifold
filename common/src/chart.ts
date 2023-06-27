import { ScaleContinuousNumeric, ScaleTime } from 'd3-scale'
import { Dispatch, SetStateAction } from 'react'
import { removeUndefinedProps } from './util/object'

export type Point<X, Y, T = unknown> = { x: X; y: Y; obj?: T }
export type MultiPoint<T = unknown> = Point<number, number[], T>
export type HistoryPoint<T = unknown> = Point<number, number, T>
export type DistributionPoint<T = unknown> = Point<number, number, T>
export type ValueKind = 'Ṁ' | 'percent' | 'amount'

/** [x, [y0, y1, ...]] */
export type MultiSerializedPoint = [number, number[]]
/** [x, y, obj] */
export type SerializedPoint<T = unknown> =
  | Readonly<[number, number]>
  | Readonly<[number, number, T | undefined]>

export const unserializePoints = <T>(
  points: SerializedPoint<T>[] | MultiSerializedPoint[]
) => {
  return points.map(([x, y, obj]) => removeUndefinedProps({ x, y, obj }))
}

export type viewScale = {
  viewXScale: ScaleTime<number, number, never> | undefined
  setViewXScale: Dispatch<
    SetStateAction<ScaleTime<number, number, never> | undefined>
  >
  viewYScale: ScaleContinuousNumeric<number, number, never> | undefined
  setViewYScale: Dispatch<
    SetStateAction<ScaleContinuousNumeric<number, number, never> | undefined>
  >
}

export type Margin = {
  top: number
  right: number
  bottom: number
  left: number
}

export type AxisConstraints = {
  min?: number
  max?: number
  minExtent?: number
}
