import { useEffect, useRef } from 'react'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { searchNearCity } from 'web/lib/firebase/api'

export function useNearbyCities(
  referenceCityId: string | null | undefined,
  radius: number
) {
  const searchCount = useRef(0)
  const lastKnownCities = useRef<string[] | null | undefined>(undefined)
  const [nearbyCities, setNearbyCities] = usePersistentLocalState<
    string[] | undefined | null
  >(lastKnownCities.current, `nearby-cities-${referenceCityId}-${radius}`)
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
            lastKnownCities.current = null
            console.log('ERROR:', result.data)
          } else {
            const cities = (result.data.data as any[]).map((city) =>
              city.id.toString()
            )
            const citiesIncludingYours = [referenceCityId, ...cities]
            setNearbyCities(citiesIncludingYours)
            lastKnownCities.current = citiesIncludingYours
          }
        }
      })
    } else {
      setNearbyCities(null)
      lastKnownCities.current = null
    }
  }, [referenceCityId, radius])

  return nearbyCities
}
