import Confetti, { Props as ConfettiProps } from 'react-confetti'
import { sample, random } from 'lodash'
import { useWindowSize } from 'web/hooks/use-window-size'
import { useContext, useMemo } from 'react'
import { ThemeContext } from 'web/hooks/theme-context'

const NUM_VARIANTS = 20

export function FullscreenConfetti(props: ConfettiProps) {
  const { height, width } = useWindowSize()
  const { isActuallyDark } = useContext(ThemeContext)

  const flakeList = useMemo(generateFlakeList, [])

  return (
    <Confetti
      className="!fixed inset-0 !z-50"
      height={height}
      width={width}
      recycle={false}
      numberOfPieces={300}
      tweenDuration={20_000}
      // draw a snowflake!
      colors={
        isActuallyDark
          ? ['#ffffD0', '#fefeff', '#f0ffff', '#e6f8ff', '#e0f0ff', '#d0f0ff']
          : ['#6d28d9', '#94a3b8', '#0891b2', '#0ea5e9', '#2563eb', '#60a5fa']
      }
      drawShape={function (this: any, ctx) {
        this.rotateY -= this.rotationDirection * 0.07

        if (!this.flake) {
          this.angularSpin = this.angularSpin * 0.25
          this.flake = random(0, NUM_VARIANTS - 1)
        }
        ctx.stroke(flakeList[this.flake])
      }}
      {...props}
    />
  )
}

const sin60 = Math.sqrt(3) / 2
const unitCircleSixths = [
  [1, 0],
  [0.5, sin60],
  [-0.5, sin60],
  [-1, 0],
  [-0.5, -sin60],
  [0.5, -sin60],
]

// 1/6 of a snowflake
const generateFlake = () => {
  const start = sample([-3, -2, -1, 0, 1, 2, 3, null])
  const point1x = start ?? 0 + (sample([-2, -1, 0, 1, 2, 3, 5, 7]) ?? 0)
  const point1y = sample([-1, 1, 1, 2, null])
  const point2x = point1x + (sample([-2, -1, 0, 2, 4, 5, 6, 8]) ?? 0)
  const point2y = sample([-2, -1, 1, 1, 1, 2, 3]) ?? 1
  const end =
    sample([
      -2,
      start,
      point1x,
      point2x + 3,
      point2x + 5,
      point2x + 6,
      point2x + 8,
    ]) ?? 0

  const path = new Path2D()
  for (const [cos, sin] of unitCircleSixths) {
    const rotate = (x: number, y: number) =>
      [x * cos - y * sin, x * sin + y * cos] as const

    if (start != null) path.moveTo(...rotate(start, 0))
    if (point1y != null) path.lineTo(...rotate(point1x, point1y))
    path.lineTo(...rotate(point2x, point2y))
    path.lineTo(...rotate(end, 0))
    path.lineTo(...rotate(point2x, -point2y))

    if (point1y != null) path.lineTo(...rotate(point1x, -point1y))
    if (start != null) path.lineTo(...rotate(start, 0))
  }

  return path
}

const generateFlakeList = () => {
  const shards = []
  for (let i = 0; i < NUM_VARIANTS; i++) {
    shards.push(generateFlake())
  }
  return shards
}
