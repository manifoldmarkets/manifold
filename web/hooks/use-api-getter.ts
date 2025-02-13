import { APIParams, APIPath } from 'common/api/schema'
import { api } from 'web/lib/api/api'
import { useAPIGetterWithCall } from 'client-common/hooks/use-api-getter'

// react query at home
export const useAPIGetter = <P extends APIPath>(
  path: P,
  props: APIParams<P> | undefined,
  ignoreDependencies?: string[],
  overrideKey?: string,
  enabled = true
) => {
  return useAPIGetterWithCall(
    path,
    props,
    api,
    ignoreDependencies,
    overrideKey,
    enabled
  )
}
