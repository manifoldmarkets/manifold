import { FullMarket } from 'common/api/market-types'
import { filterDefined } from 'common/util/array'
import { getOpenBinaryMarketFromSlug } from 'discord-bot/api'
import { Command } from 'discord-bot/command'
import { config } from 'discord-bot/constants/config'
import {
  customEmojiCache,
  customEmojis,
  emojis,
  getAnyHandledEmojiKey,
} from 'discord-bot/emojis'
import {
  getCurrentMarketDescription,
  getSlug,
  handleReaction,
  messageEmbedsToRefresh,
  shouldIgnoreMessageFromGuild,
} from 'discord-bot/helpers'
import {
  getMarketInfoFromMessageId,
  messagesHandledViaCollector,
  saveMarketToMessageId,
} from 'discord-bot/storage'
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  MessageReaction,
  ModalSubmitInteraction,
  PartialMessageReaction,
  PartialUser,
  SlashCommandBuilder,
  StringSelectMenuInteraction,
  TextChannel,
  User,
} from 'discord.js'
import { track } from 'discord-bot/analytics'

const data = new SlashCommandBuilder()
  .setName('market')
  .setDescription('Link to a market that other users can bet on with reactions')
  .addStringOption((option) =>
    option
      .setName('link')
      .setDescription('The link to the market to bet on')
      .setRequired(true)
  ) as SlashCommandBuilder

async function execute(interaction: ChatInputCommandInteraction) {
  if (shouldIgnoreMessageFromGuild(interaction.guildId)) return

  const link = interaction.options.getString('link')
  if (!link || !link.startsWith(config.domain)) {
    await interaction.reply(
      `You must specify a market link starting with ${config.domain}`
    )
    return
  }
  const slug = getSlug(link)
  if (!slug) {
    await interaction.reply(
      'Invalid market link, could not find slug from link'
    )
    return
  }
  const market = await getOpenBinaryMarketFromSlug(slug).catch(
    async (error) => {
      console.error('Failed to get market', error)
      await interaction.reply({ content: error.message })
      return
    }
  )
  if (!market) return
  await replyWithMarketToBetOn(interaction, market)
}

export const replyWithMarketToBetOn = async (
  interaction:
    | ChatInputCommandInteraction
    | StringSelectMenuInteraction
    | ModalSubmitInteraction,
  market: FullMarket
) => {
  try {
    const message = await sendMarketIntro(interaction, market)
    const channel = interaction.channel as TextChannel
    await saveMarketToMessageId(
      message.id,
      market.id,
      getSlug(market.url),
      channel.id
    )

    const filter = (reaction: MessageReaction, user: User) => {
      if (user.id === message.author.id) return false
      return !!reaction.emoji
    }

    const collector = message.createReactionCollector({ filter, dispose: true })
    collector.on('collect', async (reaction, user) => {
      await handleReaction(reaction, user, channel, market)
    })
  } catch (error) {
    console.error('error on send market embed', error, 'for link', market.url)
  }
}

const sendMarketIntro = async (
  interaction:
    | ChatInputCommandInteraction
    | StringSelectMenuInteraction
    | ModalSubmitInteraction,
  market: FullMarket
) => {
  await interaction.deferReply()

  const { coverImageUrl } = market
  const getAttachment = async (url: string, name: string) => {
    try {
      const blob = await fetch(url).then((r) => r.blob())
      const arrayBuffer = await blob.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      return new AttachmentBuilder(buffer, { name })
    } catch (error) {
      console.error('error on get attachment', error)
      return undefined
    }
  }
  const fallbackImage = 'https://manifold.markets/logo-cover.png'
  const [cover, author] = await Promise.all([
    getAttachment(coverImageUrl ?? fallbackImage, 'cover.png').catch(() =>
      getAttachment(fallbackImage, 'cover.png')
    ),
    getAttachment(market.creatorAvatarUrl ?? fallbackImage, 'author.png'),
  ])

  const marketEmbed = new EmbedBuilder()
  marketEmbed
    .setColor(0x0099ff)
    .setTitle(
      market.question +
        ` ${Math.round((market.probability ?? 0) * 100)}% chance`
    )
    .setURL(market.url)
    .setDescription(getCurrentMarketDescription(market))
    .setThumbnail(`attachment://cover.png`)
    .setTimestamp(market.closeTime)
    .setFooter({
      text: `${market.creatorName}`,
      iconURL: `attachment://author.png`,
    })
  const message = await interaction.editReply({
    components: [getButtonRow()],
    embeds: [marketEmbed],
    files: filterDefined([cover, author]),
  })

  // Let client listener know we've this message in memory
  messagesHandledViaCollector.add(message.id)
  messageEmbedsToRefresh.add({
    message,
    marketId: market.id,
    createdTime: Date.now(),
  })
  // Add emoji reactions
  for (const emoji of emojis) {
    if (customEmojis.includes(emoji)) {
      const reactionEmoji = customEmojiCache[emoji]
      if (reactionEmoji) await message.react(reactionEmoji)
    } else await message.react(emoji)
  }

  return message
}
const getButtonRow = () => {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('details')
      .setEmoji('ℹ️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('my-position')
      .setEmoji('💰') // other ideas: 💰, 📈, 📉
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('leaderboard')
      .setEmoji('🏆')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('question')
      .setEmoji('❓')
      .setStyle(ButtonStyle.Secondary)
  )
}

export const handleOldReaction = async (
  pReaction: MessageReaction | PartialMessageReaction,
  pUser: User | PartialUser,
  client: Client
) => {
  const { message } = pReaction

  // Check if the collector is handling this message already
  const ignore = messagesHandledViaCollector.has(message.id)
  if (ignore) {
    console.log('ignoring reaction with message id:', message.id)
    return
  }

  // Check if it's a dev guild
  const guildId =
    message.guildId === null ? (await message.fetch()).guildId : message.guildId
  if (shouldIgnoreMessageFromGuild(guildId)) return

  // Check if it's one of our handled emojis
  const reaction = pReaction.partial
    ? await pReaction.fetch().catch((e) => {
        console.error('Failed to fetch reaction', e)
      })
    : pReaction
  if (!reaction) return
  const emojiKey = getAnyHandledEmojiKey(reaction)
  if (!emojiKey) return

  // Check if the message has a market matched to it
  const marketInfo = await getMarketInfoFromMessageId(message.id)
  if (!marketInfo) return
  await track(pUser.id, 'react to bet', {
    guildId,
    marketSlug: marketInfo.market_slug,
    emoji: reaction.emoji.name,
  })

  const user = pUser.partial
    ? await pUser
        .fetch()
        .then((u) => u)
        .catch((e) => {
          console.error('Failed to fetch user', e)
        })
    : pUser
  if (!user) return

  const channelId = marketInfo.channel_id ?? reaction.message.channelId
  const hasCachedChannel = client.channels.cache.has(channelId)
  const channel = hasCachedChannel
    ? client.channels.cache.get(channelId)
    : await client.channels
        .fetch(channelId)
        .then((c) => c)
        .catch((e) => {
          console.error('Failed to fetch channel', e)
        })

  console.log('got channel', channel?.id)
  if (!channel || !channel.isTextBased()) return

  const market = await getOpenBinaryMarketFromSlug(
    marketInfo.market_slug
  ).catch((e) => {
    console.error('Failed to fetch market', e)
  })
  if (!market) return
  console.log('got market', market.url)

  await handleReaction(
    reaction,
    user,
    channel as TextChannel,
    market,
    marketInfo.thread_id
  )
}

export const marketCommand = {
  data,
  execute,
} as Command
