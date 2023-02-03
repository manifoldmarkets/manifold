/* eslint-disable react-hooks/rules-of-hooks */
import { isEmpty } from 'lodash'
import { useRouter } from 'next/router'
import { useState, useEffect } from 'react'
import { IS_PRIVATE_MANIFOLD } from 'common/envs/constants'

type PropzProps = {
  // Params from the router query
  params: any
}

// getStaticPropz should exactly match getStaticProps
// This allows us to client-side render the page for authenticated users.
// TODO: Could cache the result using stale-while-revalidate: https://swr.vercel.app/
export function usePropz(
  initialProps: Record<string, unknown>,
  getStaticPropz: (props: PropzProps) => Promise<any>
) {
  // If props were successfully server-side generated, just use those
  if (!isEmpty(initialProps)) {
    return initialProps
  }

  // Otherwise, get params from router
  const router = useRouter()
  const params = router.query

  const [propz, setPropz] = useState<any>(undefined)
  useEffect(() => {
    if (router.isReady) {
      getStaticPropz({ params }).then((result) => setPropz(result.props))
    }
  }, [params])
  return propz
}

// Conditionally disable SSG for private Manifold instances
export function fromPropz(getStaticPropz: (props: PropzProps) => Promise<any>) {
  return IS_PRIVATE_MANIFOLD ? async () => ({ props: {} }) : getStaticPropz
}
