import { useEffect, useRef } from 'react'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { searchNearCity } from 'web/lib/firebase/api'

export function useNearbyCities(
  referenceCityId: string | null | undefined,
  radius: number
) {
  const searchCount = useRef(0)
  const [nearbyCities, setNearbyCities] = usePersistentInMemoryState<
    string[] | undefined | null
  >(undefined, `nearby-cities-${referenceCityId}-${radius}`)
  useEffect(() => {
    searchCount.current++
    const thisSearchCount = searchCount.current
    if (referenceCityId) {
      searchNearCity({
        cityId: referenceCityId,
        radius,
      }).then((result) => {
        if (thisSearchCount == searchCount.current) {
          if (result.status === 'failure') {
            setNearbyCities(null)
            console.log('ERROR:', result.data)
          } else {
            setNearbyCities(
              (result.data.data as any[]).map((city) => city.id.toString())
            )
          }
        }
      })
    }
  }, [referenceCityId, radius])

  return nearbyCities
}
