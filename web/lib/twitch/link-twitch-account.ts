const TWITCH_BOT_PUBLIC_URL = 'https://king-prawn-app-5btyw.ondigitalocean.app'

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
