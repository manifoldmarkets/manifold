import { useEffect } from 'react'
import { useIsAuthorized, useUser } from 'web/hooks/use-user'
import { updateUser } from 'web/lib/firebase/users'

export const useLastSeen = () => {
  const user = useUser()
  const isAuthed = useIsAuthorized()

  useEffect(() => {
    if (user?.id && isAuthed) {
      updateUser(user.id, { lastSeenTime: Date.now() })
    }
  }, [user?.id, isAuthed])
}
