import { PrivateUser, User } from 'common/user'
import { generateNewApiKey } from '../api/api-key'

const TWITCH_BOT_PUBLIC_URL = 'http://localhost:9172' //'https://king-prawn-app-5btyw.ondigitalocean.app' // TODO: Add this to env config appropriately

function postToBot(url: string, body: any): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

export async function initLinkTwitchAccount(
  manifoldUserID: string,
  manifoldUserAPIKey: string
): Promise<[string, Promise<{ twitchName: string; controlToken: string }>]> {
  const response = await postToBot(`${TWITCH_BOT_PUBLIC_URL}/api/linkInit`, {
    manifoldID: manifoldUserID,
    apiKey: manifoldUserAPIKey,
    redirectURL: window.location.href,
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

export async function updateBotEnabledForUser(
  privateUser: PrivateUser,
  botEnabled: boolean
) {
  if (botEnabled) {
    return postToBot(`${TWITCH_BOT_PUBLIC_URL}/registerchanneltwitch`, {
      apiKey: privateUser.apiKey,
    })
      .then((r) => r.json())
      .then((r) => {
        if (!r.success) throw new Error(r.message)
      })
  } else {
    return postToBot(`${TWITCH_BOT_PUBLIC_URL}/unregisterchanneltwitch`, {
      apiKey: privateUser.apiKey,
    })
      .then((r) => r.json())
      .then((r) => {
        if (!r.success) throw new Error(r.message)
      })
  }
}
