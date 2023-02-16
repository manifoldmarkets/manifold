import { User } from 'discord.js'
import { Manifold } from 'manifold-sdk'
import { manifoldMap } from './storage.js'

export const messagesHandledViaInteraction: Set<string> = new Set()
export const channelMarkets: { [k: string]: string } = {}
export const registerHelpMessage =
  'You must first register your Manifold Markets API key with /register. Go to https://manifold.markets/profile to get your API key.'
export async function getAPIInstance(user: User, notifyUser?: boolean) {
  if (!user?.id || !manifoldMap[user.id]) {
    if (notifyUser) await user.send(registerHelpMessage)
    return null
  }
  const key = manifoldMap[user.id]
  return new Manifold(key)
}
