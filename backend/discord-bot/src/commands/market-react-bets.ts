import { FullMarket } from 'common/api-market-types'
import { filterDefined } from 'common/util/array'
import { Command } from 'discord-bot/command'
import { config } from 'discord-bot/constants/config'
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageReaction,
  SlashCommandBuilder,
  StringSelectMenuInteraction,
  TextChannel,
  User,
} from 'discord.js'
import { customEmojiCache, customEmojis, emojis } from 'discord-bot/emojis'
import {
  getCurrentMarketDescription,
  getOpenBinaryMarketFromSlug,
  getSlug,
  handleReaction,
  messageEmbedsToRefresh,
  shouldIgnoreMessageFromGuild,
} from 'discord-bot/helpers'
import {
  messagesHandledViaInteraction,
  saveMarketToMessageId,
} from 'discord-bot/storage'

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
      console.log('Failed to get market', error)
      await interaction.reply({ content: error.message })
      return
    }
  )
  if (!market) return
  await replyWithMarketToBetOn(interaction, market)
}

export const replyWithMarketToBetOn = async (
  interaction: ChatInputCommandInteraction | StringSelectMenuInteraction,
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
    console.log('error on send market embed', error, 'for link', market.url)
  }
}

const sendMarketIntro = async (
  interaction: ChatInputCommandInteraction | StringSelectMenuInteraction,
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
      console.log('error on get attachment', error)
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
  messagesHandledViaInteraction.add(message.id)
  messageEmbedsToRefresh.add({ message, marketId: market.id })
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
      .setLabel('Details')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('leaderboard')
      .setLabel(`Who's winning?`)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('question')
      .setLabel('What?')
      .setStyle(ButtonStyle.Secondary)
  )
}

export const marketCommand = {
  data,
  execute,
} as Command
