import { Point } from 'common/edge/og'
import { DOMAIN } from 'common/envs/constants'

// opengraph functions that run in static props or client-side, but not in the edge (in image creation)

export function buildOgUrl<P extends Record<string, string>>(
  props: P,
  endpoint: string
) {
  const generateUrlParams = (params: P) =>
    new URLSearchParams(params).toString()

  // Change to localhost:3000 for local testing
  const url =
    // `http://localhost:3000/api/og/${endpoint}?` +
    `https://${DOMAIN}/api/og/${endpoint}?` + generateUrlParams(props)

  return url
}

// nodejs only
export function pointsToBase64(points: Point[]) {
  const floats = new Float32Array(points.flatMap(({ x, y }) => [x, y]))
  return Buffer.from(floats.buffer).toString('base64url')
}

/** Find every nth point so that less than limit points total in result */
export function compressPoints(sortedPoints: Point[], limit = 100) {
  const length = sortedPoints.length
  if (length <= limit) {
    return sortedPoints
  }

  const stepSize = Math.ceil(length / limit)
  const newPoints = []
  for (let i = 0; i < length - 1; i += stepSize) {
    newPoints.push(sortedPoints[i])
  }
  return newPoints
}
