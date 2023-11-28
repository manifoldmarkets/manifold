import { useUser } from './use-user'
import { useCallback } from 'react'
import { firebaseLogin } from 'web/lib/firebase/users'

export function useAuthCheckHandler() {
  const user = useUser()
  const isAuthenticated = !!user

  return {
    authCheckHandler: useCallback(
      async (action: (userId: string) => void) => {
        if (!isAuthenticated) {
          try {
            const credential = await firebaseLogin()

            if (credential) {
              await action(credential.user.uid)
            }

            // If desktop and the auth provider returns an error
            // If mobile, native auth provider doesn't return anything
            return
          } catch (_) {
            // Firebase may throw if the user exits early on desktop
            return
          }
        }

        await action(user.id)
      },
      [isAuthenticated]
    ),
  }
}
