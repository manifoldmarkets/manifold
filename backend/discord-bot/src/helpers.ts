import { FullMarket } from 'common/api/market-types'
import { randomString } from 'common/util/random'
import { DAY_MS } from 'common/util/time'
import * as console from 'console'
import {
  getMarketFromId,
  getMyPositionInMarket,
  getTopAndBottomPositions,
  placeBet,
} from 'discord-bot/api'
import {
  handleSearchButtonInteraction,
  searchButtonTypes,
} from 'discord-bot/commands/search'
import { config } from 'discord-bot/constants/config'
import { sendPositionsEmbed } from 'discord-bot/leaderboard'
import {
  AttachmentBuilder,
  ButtonInteraction,
  EmbedBuilder,
  Message,
  MessageReaction,
  TextChannel,
  ThreadChannel,
  User,
} from 'discord.js'
import {
  getAnyHandledEmojiKey,
  getBettingEmojisAsStrings,
  getBetInfoFromReaction,
} from './emojis.js'
import {
  getMarketInfoFromMessageId,
  getUserInfo,
  saveThreadIdToMessageId,
  updateThreadLastUpdatedTime,
} from './storage.js'

export const messageEmbedsToRefresh = new Set<{
  message: Message
  marketId: string
  createdTime: number
}>()
const discordMessageIdsToThreads: { [key: string]: ThreadChannel } = {}

// Refresh probabilities every 10 seconds
setInterval(async () => {
  if (messageEmbedsToRefresh.size === 0) return
  await Promise.all(
    Array.from(messageEmbedsToRefresh).map(async (m) => {
      const { message, marketId, createdTime } = m
      // Discard messages that are older than 2 days
      if (Date.now() - createdTime > 2 * DAY_MS) {
        messageEmbedsToRefresh.delete(m)
        return
      }
      if (message.embeds.length === 0) await message.fetch()
      const isResolved = await refreshMessage(message, marketId)
      if (isResolved) messageEmbedsToRefresh.delete(m)
    })
  )
}, 10 * 1000)

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
  market: FullMarket,
  threadId?: string
) => {
  const { name } = reaction.emoji
  console.log(`Collected ${name} from user id: ${user.id}`)
  if (!getAnyHandledEmojiKey(reaction)) {
    console.log('Not a handled emoji')
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
            console.error('Failed to fetch message', e)
          })
      : reaction.message
  if (!message) return

  // Attempt to place a bet
  await handleBet(reaction, user, channel, message, market, threadId)
}

export const handleBet = async (
  reaction: MessageReaction,
  user: User,
  channel: TextChannel,
  message: Message,
  market: FullMarket,
  threadId?: string
) => {
  const messageId = reaction.message.id
  const { outcome, amount } = getBetInfoFromReaction(reaction)
  if (!outcome || !amount) return
  console.log('betting', amount, outcome, 'on', market.id, 'for', user.tag)

  const api = await getUserInfo(user).catch(async () => {
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
      console.error('Error: failed to remove reactions:', error)
    }
  })
  if (!api) return
  try {
    const resp = await placeBet(api, market.id, amount, outcome)

    if (!resp.ok) {
      const content = `Error: ${resp.statusText}`
      await user.send(content)
      return
    }
    const bet = await resp.json()
    const newProb = bet.probAfter
    const status = `bought M$${amount} ${outcome} at ${Math.round(
      newProb * 100
    )}%`
    const content = `${user.toString()} ${status}`

    market.probability = newProb
    await sendThreadMessage(channel, market, content, messageId, threadId)
    await updateMarketStatus(message, market)
    messageEmbedsToRefresh.add({
      message,
      marketId: market.id,
      createdTime: Date.now(),
    })
  } catch (e) {
    const content = `Error placing bet: ${e}`
    await user.send(content)
  }
}
const currentProbText = (prob: number) =>
  `**${Math.round(prob * 100)}%** chance`

export const getCurrentMarketDescription = (market: FullMarket) => {
  const closed = (market.closeTime ?? 0) <= Date.now()
  let content = currentProbText(market.probability ?? 0) + '. React to differ.'

  if (closed) {
    content = market.isResolved
      ? `Resolved ${market.resolution}`
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
export const refreshMessage = async (message: Message, marketId: string) => {
  const previousEmbed = message.embeds[0]
  const marketEmbed = EmbedBuilder.from(previousEmbed)
  if (!previousEmbed || !previousEmbed.url) {
    console.log('No embed or url found')
    return
  }
  const market = await getMarketFromId(marketId)
  marketEmbed.setDescription(getCurrentMarketDescription(market))
  const isResolved = market.isResolved
  marketEmbed.setTitle(
    market.question +
      (!isResolved
        ? ` ${Math.round((market.probability ?? 0) * 100)}% chance`
        : '')
  )
  if (isResolved) {
    message.reactions
      .removeAll()
      .catch((error) => console.error('Failed to clear reactions: ', error))
    marketEmbed.setFields([])
  }
  await message.edit({ embeds: [marketEmbed], files: [] })
  return isResolved
}

export const sendChannelMessage = async (
  channel: TextChannel,
  content: string
) => {
  const marketEmbed = new EmbedBuilder().setDescription(content)
  await channel.send({ embeds: [marketEmbed] })
}

const getOrCreateThread = async (
  channel: TextChannel,
  marketName: string,
  messageId: string,
  threadId?: string
) => {
  const name = marketName.slice(0, 40) + '-' + randomString(5)
  if (discordMessageIdsToThreads[messageId])
    return discordMessageIdsToThreads[messageId]
  else if (channel.isThread()) {
    return channel
  } else if (threadId) {
    await channel.threads.fetch({}, { cache: true })
    const thread = channel.threads.cache.find((t) => t.id === threadId)
    if (thread) return thread
  }

  const thread = await channel.threads.create({
    name,
    autoArchiveDuration: 60,
    reason: 'Activity feed for market: ' + name,
  })
  discordMessageIdsToThreads[messageId] = thread
  await saveThreadIdToMessageId(messageId, thread.id)
  return thread
}

export const sendThreadMessage = async (
  channel: TextChannel,
  market: FullMarket,
  content: string,
  messageId: string,
  threadId?: string
) => {
  // get the thread id from supabase if we have one
  const thread = await getOrCreateThread(
    channel,
    market.question,
    messageId,
    threadId
  )
  await Promise.all([
    thread.send({ content, allowedMentions: { repliedUser: false } }),
    updateThreadLastUpdatedTime(messageId),
  ])
}
export const sendThreadEmbed = async (
  channel: TextChannel,
  market: FullMarket,
  content: EmbedBuilder,
  messageId: string,
  files?: AttachmentBuilder[],
  threadId?: string
) => {
  // get the thread id from supabase if we have one
  const thread = await getOrCreateThread(
    channel,
    market.question,
    messageId,
    threadId
  )
  const [message, _] = await Promise.all([
    thread.send({ embeds: [content], files }),
    updateThreadLastUpdatedTime(messageId),
  ])
  return { thread, message }
}

export const getSlug = (link: string) => {
  return link.split('/').pop()?.split('?')[0].split('#')[0] ?? ''
}

export function truncateText(text: string, slice: number) {
  if (text.length <= slice + 3) {
    return text
  }
  return text.slice(0, slice) + '...'
}

export const handleButtonPress = async (interaction: ButtonInteraction) => {
  const { customId } = interaction

  // Search button interactions
  if (searchButtonTypes.includes(customId)) {
    await handleSearchButtonInteraction(interaction)
    return
  }

  // We have to fetch the message before getting its details
  const message = await interaction.message
    .fetch()
    .then((m) => m)
    .catch((e) => {
      console.log('Error fetching message', e.message)
      return undefined
    })
  if (!message) return

  // React to bet on market button interactions
  const marketInfo = await getMarketInfoFromMessageId(message.id)
  if (!marketInfo) return

  // Help
  if (customId === 'question') {
    const { yesBetsEmojis, noBetsEmojis } = getBettingEmojisAsStrings()
    const content = `This is a prediction market from [Manifold](<${config.domain}>). You can bet that the event will happen (YES) by reacting with these emojis: ${yesBetsEmojis} and that it won't (NO) with these: ${noBetsEmojis}. The emoji numbers correspond to the amount of mana used, (i.e. your conviction) per bet.`
    await interaction.reply({ content, ephemeral: true })
    return
  }
  const market = await getMarketFromId(marketInfo.market_id)

  // User position and profit
  if (customId === 'my-position') {
    const api = await getUserInfo(interaction.user, interaction)
    if (!api) return
    const contractMetrics = await getMyPositionInMarket(
      api,
      marketInfo.market_id
    )
    if (!contractMetrics || contractMetrics.length === 0) {
      await interaction.reply({
        content: 'You have no position in this market',
        ephemeral: true,
      })
      return
    }
    const { profit, hasShares, hasYesShares, totalShares } = contractMetrics[0]
    const type = hasYesShares ? 'YES' : 'NO'
    const content = `Shares: ${
      hasShares ? Math.round(totalShares[type]) : 0
    } ${type} \nProfit: M${Math.round(profit)}`

    await interaction.reply({ content, ephemeral: true })
    return
  }

  // Market description
  if (customId === 'details') {
    const { textDescription } = market
    const description =
      textDescription.length > 1995
        ? textDescription.slice(0, 1995) + '...'
        : textDescription
    const content = `${
      description.length > 0 ? description : 'No market description provided :('
    }`
    await interaction.reply({ content, ephemeral: true })
    return
  }

  // Market top and bottom positions
  if (customId === 'leaderboard') {
    const { contractMetrics, market } = await getTopAndBottomPositions(
      marketInfo.market_slug,
      'profit'
    ).catch(async (error) => {
      console.error('Failed to get positions', error)
      await interaction.reply({ content: error.message, ephemeral: true })
      return { contractMetrics: [], market: null }
    })
    if (!contractMetrics || !market) return
    await sendPositionsEmbed(
      interaction,
      market,
      contractMetrics,
      message,
      marketInfo.thread_id
    )
  }
}
