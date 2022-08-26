import { User } from 'common/user'
import dayjs from 'dayjs'
import { useEffect } from 'react'
import { generateNewApiKey } from 'web/lib/api/api-key'
import { getUserAndPrivateUser } from 'web/lib/firebase/users'
import { initLinkTwitchAccount } from 'web/lib/twitch/link-twitch-account'

import { safeLocalStorage } from 'web/lib/util/local'

type page_redirects = 'twitch'

const key = 'redirect-after-signup'

export const useRedirectAfterSignup = (page: page_redirects) => {
  useEffect(() => {
    safeLocalStorage()?.setItem(key, page)
  }, [page])
}

export const handleRedirectAfterSignup = async (user: User | null) => {
  const redirect = safeLocalStorage()?.getItem(key)

  if (!user || !redirect) return

  safeLocalStorage()?.removeItem(key)

  const now = dayjs().utc()
  const userCreatedTime = dayjs(user.createdTime)
  if (now.diff(userCreatedTime, 'minute') > 5) return

  if (redirect === 'twitch') {
    const { privateUser } = await getUserAndPrivateUser(user.id)

    const apiKey = privateUser.apiKey ?? (await generateNewApiKey(user.id))
    if (!apiKey) return

    try {
      const [twitchAuthURL, linkSuccessPromise] = await initLinkTwitchAccount(
        privateUser.id,
        apiKey
      )
      window.open(twitchAuthURL) // TODO: Handle browser pop-up block
      const data = await linkSuccessPromise // TODO: Do something with result?
      console.debug(`Successfully linked Twitch account '${data.twitchName}'`)
    } catch (e) {
      console.error(e)
    }
  }
}
