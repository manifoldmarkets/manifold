import { SerializedPoint } from 'common/chart'
import { base64toFloat32Points, base64toPoints } from 'common/edge/og'
import { pointsToBase64, pointsToBase64Float32 } from './og'

describe('og points encoding', () => {
  const points: SerializedPoint[] = [
    [1_700_000_000_000, 0.54],
    [1_700_000_600_000, 0.46],
    [1_700_086_400_000, 0.61],
  ]

  it('round-trips through the float64 encoding exactly', () => {
    expect(base64toPoints(pointsToBase64(points))).toEqual(
      points.map(([x, y]) => ({ x, y }))
    )
  })

  it('round-trips through the float32 encoding within chart precision', () => {
    const encoded = pointsToBase64Float32(points)
    expect(encoded.length).toBeLessThan(pointsToBase64(points).length / 1.9)

    const decoded = base64toFloat32Points(encoded)
    expect(decoded).toHaveLength(points.length)
    decoded.forEach((p, i) => {
      // ms timestamps lose ~2 minutes of precision in float32
      expect(Math.abs(p.x - points[i][0])).toBeLessThan(2 * 60 * 1000)
      expect(p.y).toBeCloseTo(points[i][1], 5)
    })
  })
})
