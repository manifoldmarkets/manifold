import * as console from 'console'
import {
  Message,
  MessageReaction,
  TextChannel,
  ThreadChannel,
  User,
} from 'discord.js'
import { FullMarket } from 'manifold-sdk'
import { registerHelpMessage, userApiKey } from './common.js'
import { bettingEmojis, customEmojis } from './emojis.js'

const discordThreads: { [key: string]: ThreadChannel } = {}

export const handleBet = async (
  reaction: MessageReaction,
  user: User,
  channel: TextChannel,
  message: Message,
  market: FullMarket,
  sale?: boolean,
  refreshUsersCache?: boolean
) => {
  const emojiKey = customEmojis.includes(reaction.emoji.id ?? '_')
    ? reaction.emoji.id
    : reaction.emoji.name
  if (!emojiKey || !Object.keys(bettingEmojis).includes(emojiKey)) return

  const { amount, outcome: buyOutcome } = bettingEmojis[emojiKey]
  try {
    const apiKey = userApiKey(user.id)
    if (!apiKey) {
      if (sale) return
      user.send(registerHelpMessage)
      if (refreshUsersCache) {
        await Promise.all(message.reactions.cache?.map((r) => r.users.fetch()))
      }
      const userReactions = message.reactions.cache.filter((reaction) =>
        reaction.users.cache.has(user.id)
      )
      try {
        for (const reaction of userReactions.values()) {
          await reaction.users.remove(user.id)
        }
      } catch (error) {
        console.error('Failed to remove reactions.')
      }
      return
    }

    const outcome = sale ? (buyOutcome === 'YES' ? 'NO' : 'YES') : buyOutcome
    // send json post request to api
    const resp = await fetch('https://manifold.markets/api/v0/bet', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Key ${apiKey}`,
      },
      body: JSON.stringify({
        amount,
        contractId: market.id,
        outcome,
      }),
    })
    if (!resp.ok) {
      const content = `Error: ${resp.statusText}`
      await sendThreadMessage(channel, market, content, user)
      return
    }
    const content = `${user.tag} ${
      sale ? 'sold' : 'bet'
    } M$${amount} on ${buyOutcome}.`
    await sendThreadMessage(channel, market, content, user)
    const bet = await resp.json()
    await message.edit({
      content: getNewMessageContent(message.content, bet.probAfter),
    })
  } catch (e) {
    const content = `Error: ${e}`
    await sendThreadMessage(channel, market, content, user)
  }
}

const getNewMessageContent = (content: string, newProb: number) => {
  const probString = content.split('Current Probability: ')[1]
  const newProbString = Math.round(newProb * 100) + '%'
  return content.replace(probString, newProbString)
}

const getThread = async (
  channel: TextChannel,
  name: string,
  title?: string
) => {
  if (discordThreads[name]) return discordThreads[name]
  let thread = channel.threads.cache.find((x) => x.name === name)
  if (thread) return thread
  thread = await channel.threads.create({
    name,
    autoArchiveDuration: 60,
    reason: 'Activity feed for market: ' + title ?? name,
  })
  discordThreads[name] = thread
  return thread
}

export const sendThreadMessage = async (
  channel: TextChannel,
  market: FullMarket,
  content: string,
  user: User
) => {
  const thread = await getThread(channel, market.question)
  await Promise.all([thread.members.add(user), thread.send(content)])
}

export const sendThreadErrorMessage = async (
  channel: TextChannel,
  marketSlug: string,
  content: string,
  user: User
) => {
  const thread = await getThread(channel, marketSlug)
  await Promise.all([thread.members.add(user), thread.send(content)])
}

export const getSlug = (link: string) => {
  return link.split('/').pop()?.split('?')[0].split('#')[0]
}

export const getMarketFromSlug = async (
  slug: string,
  errorCallback?: (message: string) => void
) => {
  const resp = await fetch(`https://manifold.markets/api/v0/slug/${slug}`)
  if (!resp.ok) {
    await errorCallback?.('Market not found with slug: ' + slug)
    return
  }
  const market = await resp.json()
  if (market.isResolved || (market.closeTime ?? 0) < Date.now()) {
    await errorCallback?.('Market is resolved, no longer accepting bets')
    return
  }
  if (market.outcomeType !== 'BINARY') {
    await errorCallback?.('Only Yes/No markets are supported')
    return
  }
  return market
}
