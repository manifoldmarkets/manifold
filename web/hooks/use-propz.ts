import _ from 'lodash'
import { useRouter } from 'next/router'
import { useState, useEffect } from 'react'
import { IS_PRIVATE_MANIFOLD } from '../../common/envs/constants'

type PropzProps = {
  params: any
}

// getStaticPropz should exactly match getStaticProps
// This allows us to client-side render the page for authenticated users.
// TODO: Could cache the result using stale-while-revalidate: https://swr.vercel.app/
export function usePropz(
  initialProps: Object,
  getStaticPropz: (props: PropzProps) => Promise<any>,
  // Dynamic routes will need the query params from the router
  needParams?: boolean
) {
  // If props were successfully server-side generated, just use those
  if (!_.isEmpty(initialProps)) {
    return initialProps
  }

  // Otherwise, get params from router
  const router = useRouter()
  const params = router.query

  const [propz, setPropz] = useState<any>(undefined)
  useEffect(() => {
    if (needParams && _.isEmpty(params)) {
      return
    }
    getStaticPropz({ params }).then((result) => setPropz(result.props))
  }, [params])
  return propz
}

// Conditionally disable SSG for private Manifold instances
export function fromPropz(getStaticPropz: (props: PropzProps) => Promise<any>) {
  return IS_PRIVATE_MANIFOLD ? async () => ({ props: {} }) : getStaticPropz
}
