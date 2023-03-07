import { FullMarket } from 'common/api-market-types'
import { Command } from 'discord-bot/command'
import { config } from 'discord-bot/constants/config'
import {
  AttachmentBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageReaction,
  SlashCommandBuilder,
  TextChannel,
  User,
} from 'discord.js'
import {
  customEmojiCache,
  customEmojis,
  emojis,
  getBettingEmojisAsStrings,
} from 'discord-bot/emojis'
import {
  getCurrentMarketDescription,
  getOpenBinaryMarketFromSlug,
  getSlug,
  handleReaction,
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

  const message = await sendMarketIntro(interaction, market)
  const channel = interaction.channel as TextChannel
  await saveMarketToMessageId(message.id, market.id, slug, channel.id)

  const filter = (reaction: MessageReaction, user: User) => {
    if (user.id === message.author.id) return false
    return !!reaction.emoji
  }

  const collector = message.createReactionCollector({ filter, dispose: true })
  collector.on('collect', async (reaction, user) => {
    await handleReaction(reaction, user, channel, market)
  })

  // Removed the un react action for now
  // collector.on('remove', async (reaction, user) => {
  //   const message = reaction.message.partial
  //     ? await reaction.message.fetch()
  //     : reaction.message
  //
  //   await handleBet(reaction, user, channel, message, market, true)
  // })
}

const sendMarketIntro = async (
  interaction: ChatInputCommandInteraction,
  market: FullMarket
) => {
  await interaction.deferReply()
  const { yesBetsEmojis, noBetsEmojis } = getBettingEmojisAsStrings()

  const { coverImageUrl } = market
  const getAttachment = async (url: string, name: string) => {
    const blob = await fetch(url).then((r) => r.blob())
    const arrayBuffer = await blob.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    return new AttachmentBuilder(buffer, { name })
  }
  const fallbackImage = 'https://manifold.markets/logo-cover.png'
  const [cover, author] = await Promise.all([
    getAttachment(coverImageUrl ?? fallbackImage, 'cover.png'),
    getAttachment(market.creatorAvatarUrl ?? fallbackImage, 'author.png'),
  ])

  const marketEmbed = new EmbedBuilder()
  marketEmbed
    .setColor(0x0099ff)
    .setTitle(market.question)
    .setURL(market.url)
    .setDescription(getCurrentMarketDescription(market))
    .setThumbnail(`attachment://cover.png`)
    .addFields({
      name: `React to bet`,
      value: `YES: ${yesBetsEmojis}   NO: ${noBetsEmojis}`,
    })
    .setTimestamp(market.closeTime)
    .setFooter({
      text: `${market.creatorName}`,
      iconURL: `attachment://author.png`,
    })

  const message = await interaction.editReply({
    embeds: [marketEmbed],
    files: [cover, author],
  })

  // Let client listener know we've this message in memory
  messagesHandledViaInteraction.add(message.id)

  // Add emoji reactions
  for (const emoji of emojis) {
    if (customEmojis.includes(emoji)) {
      const reactionEmoji = customEmojiCache[emoji]
      if (reactionEmoji) await message.react(reactionEmoji)
    } else await message.react(emoji)
  }

  return message
}

export const marketCommand = {
  data,
  execute,
} as Command
