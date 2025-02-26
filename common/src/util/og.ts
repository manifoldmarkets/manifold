import { SerializedPoint } from 'common/chart'
import { DOMAIN } from 'common/envs/constants'
import { mapValues } from 'lodash'

// opengraph functions that run in static props or client-side, but not in the edge (in image creation)

export function buildOgUrl<P extends Record<string, string | string[]>>(
  props: P,
  endpoint: string,
  domain?: string
) {
  const generateUrlParams = (params: P) =>
    new URLSearchParams(
      mapValues(params, (v) =>
        typeof v === 'string' ? v : v.length === 0 ? '' : v.join(',')
      )
    ).toString()

  let domainWithProtocol = domain ?? DOMAIN
  if (!domainWithProtocol.includes('://'))
    domainWithProtocol = 'https://' + domainWithProtocol

  return `${domainWithProtocol}/api/og/${endpoint}?${generateUrlParams(props)}`
}

// nodejs only
export function pointsToBase64(points: SerializedPoint[]) {
  const floats = new Float64Array(points.flatMap((p) => [p[0], p[1]]))
  return Buffer.from(floats.buffer).toString('base64url')
}
