import { useEffect } from "react"

export function useNearbyCities(referenceCityId: string) {
  useEffect(() => {
    // if (isAuth) {
    searchNearCity({ cityId: '45633', radius: 100 }).then((result) => {
      console.log('NEAR YOU', result)
    })
    // }
  }, [])
}
