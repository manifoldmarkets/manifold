import Router from 'next/router'
import { useEffect } from 'react'

import { useUser } from 'web/hooks/use-user'

// Deprecated: redirects to /portfolio.
// Eventually, this will be removed.
export default function TradesPage() {
  const user = useUser()

  useEffect(() => {
    if (user === null) Router.replace('/')
    else Router.replace('/portfolio')
  })

  return <></>
}
