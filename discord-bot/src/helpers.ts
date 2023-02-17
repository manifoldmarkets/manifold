import * as console from 'console'
import {
  EmbedBuilder,
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
    const bet = await resp.json()
    const content = `${user.tag} ${
      sale ? 'sold' : 'bet'
    } M$${amount} on ${buyOutcome}. New probability: ${Math.round(
      bet.probAfter * 100
    )}%`
    await sendThreadMessage(channel, market, content, user)
    await editMessageWithNewProb(message, bet.probAfter)
  } catch (e) {
    const content = `Error: ${e}`
    await sendThreadMessage(channel, market, content, user)
  }
}
export const currentProbText = (prob: number) =>
  `**${Math.round(prob * 100)}%** chance`

const editMessageWithNewProb = async (message: Message, newProb: number) => {
  const previousEmbed = message.embeds[0]
  const marketEmbed = EmbedBuilder.from(previousEmbed)
  marketEmbed.setDescription(currentProbText(newProb))
  await message.edit({ embeds: [marketEmbed] })
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
    name: name.slice(0, 95) + '...',
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
