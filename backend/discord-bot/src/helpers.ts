import { FullMarket } from 'common/api-market-types'
import * as console from 'console'
import { config } from 'discord-bot/constants/config'
import {
  EmbedBuilder,
  hyperlink,
  Message,
  MessageReaction,
  TextChannel,
  User,
} from 'discord.js'
import {
  bettingEmojis,
  getAnyHandledEmojiKey,
  getBetEmojiKey,
  getBettingEmojisAsStrings,
} from './emojis.js'
import { registerHelpMessage, userApiKey } from './storage.js'

export const shouldIgnoreMessageFromGuild = (guildId: string | null) => {
  if (config.guildId && guildId !== config.guildId) {
    console.log('Not handling message or reaction from guild id', guildId)
    return true
  }
  if (config.ignoreGuildIds?.includes(guildId ?? '')) {
    console.log('Not handling message or reaction from guild id', guildId)
    return true
  }
  return false
}

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
    await user.send(content)
    return
  }

  // Help
  if (name === '❓') {
    const { yesBetsEmojis, noBetsEmojis } = getBettingEmojisAsStrings()
    const content = `This is a market for the question "${market.question}". You can bet YES by reacting with these emojis: ${yesBetsEmojis} and NO with these: ${noBetsEmojis}. The emoji numbers correspond to the amount of mana used per bet.`
    await user.send(content)
    return
  }
  // The embeds don't load unless we fetch the message every time even though the message is not marked as partial
  // seems related to: https://github.com/discordjs/discord.js/issues/7697#issuecomment-1073432737
  const message =
    reaction.message.embeds.length === 0 || reaction.message.partial
      ? await reaction.message
          .fetch()
          .then((m) => m)
          .catch((e) => {
            console.log('Failed to fetch message', e)
          })
      : reaction.message
  if (!message) return

  // Attempt to place a bet
  await handleBet(reaction, user, channel, message, market)
}

export const handleBet = async (
  reaction: MessageReaction,
  user: User,
  channel: TextChannel,
  message: Message,
  market: FullMarket
) => {
  const emojiKey = getBetEmojiKey(reaction)
  if (!emojiKey) return
  const messageId = reaction.message.id
  const { amount, outcome: buyOutcome } = bettingEmojis[emojiKey]
  console.log('betting', amount, buyOutcome, 'on', market.id, 'for', user.tag)
  try {
    const apiKey = await userApiKey(user.id).catch((e) => {
      console.log('Failed to get user api key', e)
      return null
    })

    if (!apiKey) {
      await user.send(registerHelpMessage(user.id))
      const userReactions = message.reactions.cache.filter(
        (r) =>
          (r.emoji.id ?? r.emoji.name) ===
          (reaction.emoji.id ?? reaction.emoji.name)
      )
      try {
        for (const react of userReactions.values()) {
          await react.users.fetch()
          if (react.users.cache.has(user.id)) await react.users.remove(user.id)
        }
      } catch (error) {
        console.error('Failed to remove reactions.')
      }
      return
    }

    const outcome = buyOutcome
    // send json post request to api
    const resp = await fetch(`${config.domain}api/v0/bet`, {
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
      await user.send(content)
      return
    }
    const bet = await resp.json()
    const newProb = bet.probAfter
    console.log(market.question.length)
    const truncatedQuestion =
      market.question.length > 69
        ? `${market.question.substring(0, 66)}...`
        : market.question
    const messageLink = hyperlink(
      `${truncatedQuestion}`,
      `https://discord.com/channels/${channel.guildId}/${channel.id}/${messageId}`
    )

    const content = `${user.toString()} bought M$${amount} ${buyOutcome} on ${messageLink} Now ${Math.round(
      newProb * 100
    )}%`
    market.probability = newProb
    await sendChannelMessage(channel, market, content)
    await updateMarketStatus(message, market)
  } catch (e) {
    const content = `Error: ${e}`
    await user.send(content)
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
  marketEmbed.setTitle(
    market.question + ` ${Math.round((market.probability ?? 0) * 100)}% chance`
  )
  await message.edit({ embeds: [marketEmbed], files: [] })
}

export const sendChannelMessage = async (
  channel: TextChannel,
  market: FullMarket,
  content: string
) => {
  const marketEmbed = new EmbedBuilder().setDescription(content)
  await channel.send({ embeds: [marketEmbed] })
}

export const getSlug = (link: string) => {
  return link.split('/').pop()?.split('?')[0].split('#')[0]
}

export const getMarketFromSlug = async (slug: string) => {
  const resp = await fetch(`${config.domain}api/v0/slug/${slug}`)
  if (!resp.ok) {
    throw new Error('Market not found with slug: ' + slug)
  }
  return (await resp.json()) as FullMarket
}

export const getOpenBinaryMarketFromSlug = async (slug: string) => {
  const market = await getMarketFromSlug(slug)

  if (market.isResolved || (market.closeTime ?? 0) < Date.now()) {
    const status = market.isResolved ? 'resolved' : 'closed'
    throw new Error(`Market is ${status}, no longer accepting bets`)
  }
  const isClosed = (market.closeTime ?? 0) < Date.now()
  console.log('market', market.id, 'is closed?', isClosed)
  if (market.outcomeType !== 'BINARY') {
    throw new Error('Only Yes/No markets are supported')
  }
  return market
}
