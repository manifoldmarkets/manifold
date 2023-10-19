import { useEffect } from 'react'
import { useLover } from 'love/hooks/use-lover'
import { useIsAuthorized } from 'web/hooks/use-user'
import { updateLover } from 'web/lib/firebase/love/api'
export const useOnline = () => {
  const lover = useLover()
  const isAuthed = useIsAuthorized()
  useEffect(() => {
    if (!lover || !isAuthed) return
    updateLover({ last_online_time: new Date().toISOString() })
  }, [])
}
