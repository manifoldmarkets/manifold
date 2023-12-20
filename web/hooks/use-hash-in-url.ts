import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

export const useHashInUrl = () => {
  const [hash, setHash] = useState<string | undefined>()
  const pathname = usePathname() ?? ''
  useEffect(() => {
    const parts = pathname.split('#')
    if (parts.length > 1 && parts[1] != null) {
      const id = parts[1]
      setHash(id)
    } else {
      setHash(undefined)
    }
  }, [pathname])
  return hash
}
