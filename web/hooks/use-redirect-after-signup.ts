import { User } from 'common/user'
import dayjs from 'dayjs'
import { useEffect } from 'react'

import { safeLocalStorage } from 'web/lib/util/local'

type page_redirects = 'twitch'

const key = 'redirect-after-signup'

export const useRedirectAfterSignup = (page: page_redirects) => {
  useEffect(() => {
    safeLocalStorage()?.setItem(key, page)
  }, [page])
}

export const handleRedirectAfterSignup = (user: User | null) => {
  const redirect = safeLocalStorage()?.getItem(key)
  safeLocalStorage()?.removeItem(key)

  if (!user || !redirect) return

  const now = dayjs().utc()
  const userCreatedTime = dayjs(user.createdTime)
  if (now.diff(userCreatedTime, 'minute') > 5) return

  if (redirect === 'twitch') {
    // TODO: actual Twitch redirect
  }
}
