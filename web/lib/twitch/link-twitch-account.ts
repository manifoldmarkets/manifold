import { PrivateUser, User } from 'common/user'
import { generateNewApiKey } from '../api/api-key'

const TWITCH_BOT_PUBLIC_URL = 'https://king-prawn-app-5btyw.ondigitalocean.app' // TODO: Add this to env config appropriately

async function postToBot(url: string, body: unknown) {
  const result = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await result.json()
  if (!result.ok) {
    throw new Error(json.message)
  } else {
    return json
  }
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
  const responseFetch = fetch(
    `${TWITCH_BOT_PUBLIC_URL}/api/linkResult?userID=${manifoldUserID}`
  )
  return [response.twitchAuthURL, responseFetch.then((r) => r.json())]
}

export async function linkTwitchAccountRedirect(
  user: User,
  privateUser: PrivateUser
) {
  const apiKey = privateUser.apiKey ?? (await generateNewApiKey(user.id))
  if (!apiKey) throw new Error("Couldn't retrieve or create Manifold api key")

  const [twitchAuthURL] = await initLinkTwitchAccount(user.id, apiKey)

  window.location.href = twitchAuthURL
  await new Promise((r) => setTimeout(r, 1e10)) // Wait "forever" for the page to change location
}

export async function updateBotEnabledForUser(
  privateUser: PrivateUser,
  botEnabled: boolean
) {
  if (botEnabled) {
    return postToBot(`${TWITCH_BOT_PUBLIC_URL}/registerchanneltwitch`, {
      apiKey: privateUser.apiKey,
    }).then((r) => {
      if (!r.success) throw new Error(r.message)
    })
  } else {
    return postToBot(`${TWITCH_BOT_PUBLIC_URL}/unregisterchanneltwitch`, {
      apiKey: privateUser.apiKey,
    }).then((r) => {
      if (!r.success) throw new Error(r.message)
    })
  }
}

export function getOverlayURLForUser(privateUser: PrivateUser) {
  const controlToken = privateUser?.twitchInfo?.controlToken
  return `${TWITCH_BOT_PUBLIC_URL}/overlay?t=${controlToken}`
}

export function getDockURLForUser(privateUser: PrivateUser) {
  const controlToken = privateUser?.twitchInfo?.controlToken
  return `${TWITCH_BOT_PUBLIC_URL}/dock?t=${controlToken}`
}
