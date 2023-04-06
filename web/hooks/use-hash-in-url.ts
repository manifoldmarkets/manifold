import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'

export const useHashInUrl = () => {
  const [hash, setHash] = useState<string | undefined>()
  const router = useRouter()
  useEffect(() => {
    if (router.isReady) {
      const parts = router.asPath.split('#')
      if (parts.length > 1 && parts[1] != null) {
        const id = parts[1]
        setHash(id)
      } else {
        setHash(undefined)
      }
    }
  }, [router.isReady, router.asPath])
  return hash
}
