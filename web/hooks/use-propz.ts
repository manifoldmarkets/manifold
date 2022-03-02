import _ from 'lodash'
import { useRouter } from 'next/router'
import { useState, useEffect } from 'react'

type PropzProps = {
  params: any
}

// getStaticPropz should exactly match getStaticProps
// This allows us to client-side render the page for authenticated users.
// TODO: Could cache the result using stale-while-revalidate: https://swr.vercel.app/
export function usePropz(
  getStaticPropz: (props?: PropzProps) => Promise<any>,
  // Dynamic routes will need the query params from the router
  needParams?: boolean
) {
  // Get params from router
  const router = useRouter()
  const params = router.query

  const [propz, setPropz] = useState<any>(undefined)
  useEffect(() => {
    if (needParams && _.isEmpty(params)) {
      return
    }
    // @ts-ignore
    getStaticPropz({ params }).then((result) => setPropz(result.props))
  }, [params])
  return propz
}
