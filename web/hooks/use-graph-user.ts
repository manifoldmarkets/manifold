import { DisplayUser } from 'common/api/user-types'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { api } from 'web/lib/api/api'

const GRAPH_USER_KEY = 'graphUser'

export const useGraphUserFromUrl = () => {
  const router = useRouter()
  const [graphUser, setGraphUserState] = useState<DisplayUser | undefined>()
  const [ready, setReady] = useState(false)

  // On page load, read graphUser from URL and fetch user data
  useEffect(() => {
    if (!router.isReady) return

    const graphUserId = router.query[GRAPH_USER_KEY]
    if (typeof graphUserId === 'string' && graphUserId) {
      // Fetch user by ID
      api('user/by-id/:id/lite', { id: graphUserId })
        .then((user) => {
          if (user) {
            setGraphUserState(user)
          }
        })
        .catch(() => {
          // User not found, clear from URL
          updateUrl(undefined)
        })
        .finally(() => setReady(true))
    } else {
      setReady(true)
    }
  }, [router.isReady])

  const updateUrl = (userId: string | undefined) => {
    const { pathname, query } = router
    const newQuery = { ...query }
    if (userId) {
      newQuery[GRAPH_USER_KEY] = userId
    } else {
      delete newQuery[GRAPH_USER_KEY]
    }
    router.replace({ pathname, query: newQuery }, undefined, { shallow: true })
  }

  const setGraphUser = (user: DisplayUser | undefined) => {
    setGraphUserState(user)
    updateUrl(user?.id)
  }

  return { graphUser, setGraphUser, ready }
}
