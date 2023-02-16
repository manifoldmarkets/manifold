import {
  Message,
  MessageReaction,
  TextChannel,
  ThreadChannel,
  User,
} from 'discord.js'
import { FullMarket } from 'manifold-sdk'
import { getAPIInstance } from './common.js'
import { bettingEmojis, customEmojis } from './emojis.js'

const discordThreads: { [key: string]: ThreadChannel } = {}

export const handleBet = async (
  reaction: MessageReaction,
  user: User,
  channel: TextChannel,
  message: Message,
  market: FullMarket,
  sale?: boolean
) => {
  const emojiKey = customEmojis.includes(reaction.emoji.id ?? '_')
    ? reaction.emoji.id
    : reaction.emoji.name
  if (!emojiKey || !Object.keys(bettingEmojis).includes(emojiKey)) return

  const { amount, outcome: buyOutcome } = bettingEmojis[emojiKey]
  const slug = getSlug(market.url) ?? 'error'
  try {
    const api = await getAPIInstance(user, !sale)
    if (!api) {
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
        Authorization: `Key ${api.apiKey}`,
      },
      body: JSON.stringify({
        amount,
        contractId: market.id,
        outcome,
      }),
    })
    if (!resp.ok) {
      const content = `Error: ${resp.statusText}`
      await sendThreadMessage(channel, slug, content, user)
      return
    }
    const content = `${user.tag} ${
      sale ? 'sold' : 'bet'
    } M$${amount} on ${buyOutcome} in "${market.question}"!`
    await sendThreadMessage(channel, slug, content, user)
  } catch (e) {
    const content = `Error: ${e}`
    await sendThreadMessage(channel, slug, content, user)
  }
}

const getThread = async (channel: TextChannel, marketSlug: string) => {
  const name = `market-bot-bets-${marketSlug}`
  if (discordThreads[name]) return discordThreads[name]
  let thread = channel.threads.cache.find((x) => x.name === name)
  if (thread) return thread
  thread = await channel.threads.create({
    name,
    autoArchiveDuration: 60,
    reason: 'Activity feed for market at ' + marketSlug,
  })
  discordThreads[name] = thread
  return thread
}

export const sendThreadMessage = async (
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
  const market: FullMarket = await fetch(
    `https://manifold.markets/api/v0/slug/${slug}`
  ).then((res) => res.json())

  if (!market) {
    await errorCallback?.('Market not found with slug: ' + slug)
    return
  }
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
