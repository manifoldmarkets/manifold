import { User, PrivateUser } from 'common/user'
import { generateNewApiKey } from '../api/api-key'
import { updatePrivateUser } from '../firebase/users'

const TWITCH_BOT_PUBLIC_URL = 'https://king-prawn-app-5btyw.ondigitalocean.app' // TODO: Add this to env config appropriately

export async function initLinkTwitchAccount(
  manifoldUserID: string,
  manifoldUserAPIKey: string
): Promise<[string, Promise<{ twitchName: string; controlToken: string }>]> {
  const response = await fetch(`${TWITCH_BOT_PUBLIC_URL}/api/linkInit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      manifoldID: manifoldUserID,
      apiKey: manifoldUserAPIKey,
      redirectURL: window.location.href,
    }),
  })
  const responseData = await response.json()
  if (!response.ok) {
    throw new Error(responseData.message)
  }
  const responseFetch = fetch(
    `${TWITCH_BOT_PUBLIC_URL}/api/linkResult?userID=${manifoldUserID}`
  )
  return [responseData.twitchAuthURL, responseFetch.then((r) => r.json())]
}

export async function linkTwitchAccountRedirect(
  user: User,
  privateUser: PrivateUser
) {
  const apiKey = privateUser.apiKey ?? (await generateNewApiKey(user.id))
  if (!apiKey) throw new Error("Couldn't retrieve or create Manifold api key")

  const [twitchAuthURL] = await initLinkTwitchAccount(user.id, apiKey)

  window.location.href = twitchAuthURL
}
