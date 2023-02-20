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
import {
  bettingEmojis,
  getBetEmojiKey,
  getAnyHandledEmojiKey,
} from './emojis.js'
import { registerHelpMessage, userApiKey } from './storage.js'

const discordThreads: { [key: string]: ThreadChannel } = {}

export const handleReaction = async (
  reaction: MessageReaction,
  user: User,
  channel: TextChannel,
  market: FullMarket
) => {
  const { name } = reaction.emoji
  console.log(`Collected ${name} from user id: ${user.id}`)
  if (!getAnyHandledEmojiKey(reaction)) {
    console.log('Not a handled emoji')
    return
  }
  // Market description
  if (name === 'ℹ️') {
    const content = `Market details: ${market.textDescription}`
    await sendThreadMessage(channel, market, content, user)
    return
  }

  // Help
  if (name === '❓') {
    const content = `This is a market for the question: ${market.question}. You can bet on the outcome of the market by reacting to my previous message with the bet you want to make.`
    await sendThreadMessage(channel, market, content, user)
    return
  }
  // The embeds don't load unless we fetch the message every time even though the message is not marked as partial
  // seems related to: https://github.com/discordjs/discord.js/issues/7697#issuecomment-1073432737
  const message =
    reaction.message.embeds.length === 0 || reaction.message.partial
      ? await reaction.message.fetch()
      : reaction.message

  // Attempt to place a bet
  await handleBet(reaction, user, channel, message, market)
}

export const handleBet = async (
  reaction: MessageReaction,
  user: User,
  channel: TextChannel,
  message: Message,
  market: FullMarket,
  sale?: boolean
) => {
  const emojiKey = getBetEmojiKey(reaction)
  if (!emojiKey) return
  const { amount, outcome: buyOutcome } = bettingEmojis[emojiKey]
  console.log('betting', amount, buyOutcome, 'on', market.id, 'for', user.tag)
  try {
    const apiKey = await userApiKey(user.id)
    if (!apiKey) {
      if (sale) return
      user.send(registerHelpMessage)
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
  await message.edit({ embeds: [marketEmbed], files: [] })
}

const getThread = async (
  channel: TextChannel,
  marketName: string,
  title?: string
) => {
  const name = marketName.slice(0, 40) + '...'
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
  console.log('logging user bet', user.tag, 'to thread', thread.name)
  await Promise.all([thread.send(content)])
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
