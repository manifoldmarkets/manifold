import { APIParams, APIPath } from 'common/api/schema'
import { useAPIGetterWithCall } from 'client-common/hooks/use-api-getter'
import { api } from 'lib/api'

export const useAPIGetter = <P extends APIPath>(
  path: P,
  props: APIParams<P> | undefined,
  ignoreDependencies?: string[],
  overrideKey?: string
) => {
  return useAPIGetterWithCall(path, props, api, ignoreDependencies, overrideKey)
}
  