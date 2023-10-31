import { useEffect } from 'react'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { searchNearCity } from 'web/lib/firebase/api'

export function useNearbyCities(referenceCityId: string | null | undefined) {
  const [nearbyCities, setNearbyCities] = usePersistentInMemoryState<
    string[] | undefined | null
  >(undefined, `nearby-cities-${referenceCityId}`)
  useEffect(() => {
    if (referenceCityId) {
      searchNearCity({
        cityId: referenceCityId,
        radius: 100,
      }).then((result) => {
        if (result.status === 'failure') {
          setNearbyCities(null)
          console.log('ERROR:', result.data)
        } else {
          setNearbyCities((result.data.data as any[]).map((city) => city.id))
        }
      })
    }
  }, [referenceCityId])

  return nearbyCities
}
