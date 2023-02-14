import { Point } from 'common/edge/og'
import { DOMAIN } from 'common/envs/constants'

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
