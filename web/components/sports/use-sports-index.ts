import { useAPIGetter } from 'web/hooks/use-api-getter'

/**
 * Every sport and every other topic under Sports (see SportsSubtopic), which
 * the sports pages show topics and their pages by. Undefined until it loads;
 * `failed` once a request for it has failed and nothing is loaded. It's kept
 * for the session: `refresh` asks again.
 */
export function useSportsIndex() {
  const { data, error, loading, refresh } = useAPIGetter('sports-index', {})
  return {
    index: data && { sports: data.sports, topics: data.topics ?? [] },
    failed: !data && !!error,
    loading,
    refresh,
  }
}
