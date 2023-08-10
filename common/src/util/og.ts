import { SerializedPoint } from 'common/chart'
import { DOMAIN } from 'common/envs/constants'
import { average } from './math'

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
export function pointsToBase64(points: SerializedPoint[]) {
  const floats = new Float32Array(points.flatMap((p) => [p[0], p[1]]))
  return Buffer.from(floats.buffer).toString('base64url')
}
