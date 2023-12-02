import Confetti, { Props as ConfettiProps } from 'react-confetti'
import { sample, random } from 'lodash'

export function FullscreenConfetti(props: ConfettiProps) {
  return (
    <Confetti
      className="!fixed inset-0 !z-50"
      recycle={false}
      numberOfPieces={300}
      friction={0.996}
      gravity={0.035}
      // draw a snowflake!
      drawShape={function (ctx) {
        ctx.beginPath()
        // @ts-expect-error idk
        this.rotateY -= this.rotationDirection * 0.07

        // @ts-expect-error idk
        if (!this.params) {
          // @ts-expect-error idk
          this.angularSpin = this.angularSpin / 4
          const start = random(0, 3)
          const shaftWidth = random(1, 2)
          const fullWidth = shaftWidth * random(1, 2)
          const pointStart = random(2, 6)
          const pointSide = pointStart + random(-2, 6)
          const arrowLength = sample([random(-1, 2), pointSide + random(3, 8)])
          const arrowEnd = sample([0, 0, 0, 0, 0.1, -0.1, 1, -1, -7, 7])

          const strokeColor = sample([
            '#1d133b',
            '#2e1973',
            '#203060',
            '#2d5675',
            '#3b5970',
          ]) as string
          const fillColor = sample([
            '#feffff',
            '#f0ffff',
            '#e6f8ff',
            '#e0f0ff',
          ]) as string

          // @ts-expect-error idk
          this.params = {
            start,
            shaftWidth,
            fullWidth,
            pointStart,
            pointSide,
            arrowLength,
            arrowEnd,
            strokeColor,
            fillColor,
          }
        }
        const {
          start,
          shaftWidth,
          fullWidth,
          pointStart,
          pointSide,
          arrowLength,
          arrowEnd,
          strokeColor,
          fillColor,
          // @ts-expect-error idk
        } = this.params

        for (let i = 0; i < 12; i++) {
          ctx.moveTo(start, 0)
          ctx.lineTo(start, shaftWidth)
          ctx.lineTo(pointStart, shaftWidth)
          ctx.lineTo(pointSide, fullWidth)
          ctx.lineTo(arrowLength, arrowEnd)

          ctx.scale(-1, 1)
          if (i % 2 === 0) {
            ctx.rotate(Math.PI / 3)
          }
        }
        ctx.strokeStyle = strokeColor
        ctx.fillStyle = fillColor
        ctx.closePath()
        ctx.stroke()

        ctx.fill()
      }}
      {...props}
    />
  )
}
