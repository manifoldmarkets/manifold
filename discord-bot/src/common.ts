import { User } from 'discord.js'
import { Manifold } from 'manifold-sdk'
import { manifoldMap } from './storage.js'

export const messagesHandledViaInteraction: Set<string> = new Set()
export const channelMarkets: { [k: string]: string } = {}
export const registerHelpMessage =
  'You must first register your Manifold Markets API key with /register. Go to https://manifold.markets/my-api-key to get your API key.'
export async function getAPIInstance(user: User, errorCallback?: () => void) {
  if (!user?.id || !manifoldMap[user.id]) {
    errorCallback?.()
    return null
  }
  const key = manifoldMap[user.id]
  return new Manifold(key)
}
