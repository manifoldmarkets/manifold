import { DOMAIN } from 'common/envs/constants'
import { removeUndefinedProps } from 'common/util/object'

export function buildOgUrl<P extends Record<string, string | undefined>>(
  props: P,
  endpoint: string
) {
  const generateUrlParams = (params: P) =>
    new URLSearchParams(removeUndefinedProps(params) as any).toString()

  // Change to localhost:3000 for local testing
  const url =
    // `http://localhost:3000/api/og/${endpoint}?` +
    `https://${DOMAIN}/api/og/${endpoint}?` + generateUrlParams(props)

  return url
}
