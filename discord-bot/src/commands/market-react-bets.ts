import { FullMarket } from 'common/api-market-types'
import {
  AttachmentBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageReaction,
  SlashCommandBuilder,
  TextChannel,
  User,
} from 'discord.js'
import { customEmojis, emojis, getBettingEmojisAsStrings } from '../emojis.js'
import {
  getCurrentMarketDescription,
  getOpenBinaryMarketFromSlug,
  getSlug,
  handleReaction,
} from '../helpers.js'
import { messagesHandledViaInteraction } from '../storage.js'

export const data = new SlashCommandBuilder()
  .setName('market')
  .setDescription('Link to a market that other users can bet on with reactions')
  .addStringOption((option) =>
    option
      .setName('link')
      .setDescription('The link to the market to bet on')
      .setRequired(true)
  )

export async function execute(interaction: ChatInputCommandInteraction) {
  const link = interaction.options.getString('link')
  if (!link || !link.startsWith('https://manifold.markets/')) {
    await interaction.reply(
      'You must specify a market link starting with https://manifold.markets/'
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
  const market = await getOpenBinaryMarketFromSlug(slug, (error) =>
    interaction.reply(error)
  )
  if (!market) return

  const message = await sendMarketIntro(interaction, market)

  const filter = (reaction: MessageReaction, user: User) => {
    if (user.id === message.author.id) return false
    return !!reaction.emoji
  }

  const collector = message.createReactionCollector({ filter, dispose: true })
  const channel = interaction.channel as TextChannel
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
  const { yesBetsEmojis, noBetsEmojis } = getBettingEmojisAsStrings(
    interaction.guild
  )

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
      // TODO: this only works on my guild rn
      const reactionEmoji = interaction.guild?.emojis.cache.find(
        (e) => e.id === emoji
      )
      if (reactionEmoji) await message.react(reactionEmoji)
    } else await message.react(emoji)
  }

  return message
}
