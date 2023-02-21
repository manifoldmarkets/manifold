import { FullMarket } from 'common/api-market-types'
import * as console from 'console'
import {
  EmbedBuilder,
  Message,
  MessageReaction,
  TextChannel,
  ThreadChannel,
  User,
} from 'discord.js'
import {
  bettingEmojis,
  getAnyHandledEmojiKey,
  getBetEmojiKey,
  getBettingEmojisAsStrings,
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
    await sendThreadMessage(channel, market, content, user, true)
    return
  }

  // Help
  if (name === '❓') {
    const { yesBetsEmojis, noBetsEmojis } = getBettingEmojisAsStrings(
      channel.guild
    )
    const content = `This is a market for the question "${market.question}". You can bet YES by reacting with these emojis: ${yesBetsEmojis} and NO with these: ${noBetsEmojis}. The emoji numbers correspond to the amount of mana used per bet.`
    await user.send(content)
    return
  }
  // The embeds don't load unless we fetch the message every time even though the message is not marked as partial
  // seems related to: https://github.com/discordjs/discord.js/issues/7697#issuecomment-1073432737
  const message =
    reaction.message.embeds.length === 0 || reaction.message.partial
      ? await reaction.message.fetch()
      : reaction.message

  const closed = (market.closeTime ?? 0) <= Date.now()
  if (closed) {
    await sendThreadMessage(
      channel,
      market,
      getCurrentMarketDescription(market),
      user
    )
    await updateMarketStatus(message, market)
    return
  }
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
      await user.send(registerHelpMessage)
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
    const newProb = bet.probAfter
    const content = `${user.tag} ${
      sale ? 'sold' : 'bet'
    } M$${amount} on ${buyOutcome}. New probability: ${Math.round(
      newProb * 100
    )}%`
    market.probability = newProb
    await sendThreadMessage(channel, market, content, user)
    await updateMarketStatus(message, market)
  } catch (e) {
    const content = `Error: ${e}`
    await sendThreadMessage(channel, market, content, user)
  }
}
const currentProbText = (prob: number) =>
  `**${Math.round(prob * 100)}%** chance`

export const getCurrentMarketDescription = (market: FullMarket) => {
  const closed = (market.closeTime ?? 0) <= Date.now()
  let content = currentProbText(market.probability ?? 0)
  if (closed) {
    content = market.isResolved
      ? `Market resolved ${market.resolution}`
      : `Market closed at ${Math.round(
          (market.probability ?? 0) * 100
        )}% chance.`
  }
  return content
}

const updateMarketStatus = async (message: Message, market: FullMarket) => {
  const previousEmbed = message.embeds[0]
  const marketEmbed = EmbedBuilder.from(previousEmbed)
  marketEmbed.setDescription(getCurrentMarketDescription(market))
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
  user: User,
  addUserToThread?: boolean
) => {
  const thread = await getThread(channel, market.question)
  await Promise.all([
    thread.send(content),
    addUserToThread ? thread.members.add(user) : Promise.resolve(),
  ])
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
  return await resp.json()
}

export const getOpenBinaryMarketFromSlug = async (
  slug: string,
  errorCallback?: (message: string) => void
) => {
  const market = await getMarketFromSlug(slug, errorCallback)
  if (!market) return

  if (market.isResolved || (market.closeTime ?? 0) < Date.now()) {
    const status = market.isResolved ? 'resolved' : 'closed'
    await errorCallback?.(`Market is ${status}, no longer accepting bets`)
    return
  }
  const isClosed = (market.closeTime ?? 0) < Date.now()
  console.log('market', market.id, 'is closed?', isClosed)
  if (market.outcomeType !== 'BINARY') {
    await errorCallback?.('Only Yes/No markets are supported')
    return
  }
  return market
}
