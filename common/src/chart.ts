import { AxisScale } from 'd3-axis'
import { ScaleContinuousNumeric, ScaleTime } from 'd3-scale'
import { Dispatch, SetStateAction } from 'react'

export type Point<X, Y, T = unknown> = { x: X; y: Y; obj?: T }
export type MultiPoint<T = unknown> = Point<number, number[], T>
export type HistoryPoint<T = unknown> = Point<number, number, T>
export type DistributionPoint<T = unknown> = Point<number, number, T>
export type ValueKind = 'Ṁ' | 'percent' | 'amount'

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

export type XScale<P> = P extends Point<infer X, infer _> ? AxisScale<X> : never
export type YScale<P> = P extends Point<infer _, infer Y> ? AxisScale<Y> : never

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
