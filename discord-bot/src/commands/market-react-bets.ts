import {
  AttachmentBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageReaction,
  SlashCommandBuilder,
  TextChannel,
  User,
} from 'discord.js'
import { FullMarket } from 'manifold-sdk'
import { bettingEmojis, customEmojis, emojis, getEmoji } from '../emojis.js'
import {
  currentProbText,
  getMarketFromSlug,
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
  const market = await getMarketFromSlug(slug, (error) =>
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
type ExtraMarketProps = {
  coverImageUrl?: string
}

const sendMarketIntro = async (
  interaction: ChatInputCommandInteraction,
  market: FullMarket & ExtraMarketProps
) => {
  const placeHolderEmbed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle('Loading market...')
  let message = await interaction.reply({
    embeds: [placeHolderEmbed],
    fetchReply: true,
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

  let yesBetsEmojis = ''
  let noBetsEmojis = ''
  for (const emoji in bettingEmojis) {
    const emojiText = `${getEmoji(interaction.guild, emoji)}`
    bettingEmojis[emoji].outcome === 'YES'
      ? (yesBetsEmojis += emojiText)
      : (noBetsEmojis += emojiText)
  }

  const previousEmbed = message.embeds[0]
  const marketEmbed = EmbedBuilder.from(previousEmbed)
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
  marketEmbed
    .setColor(0x0099ff)
    .setTitle(market.question)
    .setURL(market.url)
    .setDescription(currentProbText(market.probability))
    .setThumbnail(`attachment://cover.png`)
    .addFields(
      {
        name: `React to bet`,
        value: `YES: ${yesBetsEmojis}   NO: ${noBetsEmojis}`,
        inline: true,
      }
      // {
      //   name: 'Bet NO',
      //   value: `${noBetsEmojis}`,
      // value: `test`,
      // inline: true,
      // }
    )
    .setTimestamp(market.closeTime)
    .setFooter({
      text: `${market.creatorName}`,
      iconURL: `attachment://author.png`,
    })

  message = await message.edit({
    embeds: [marketEmbed],
    files: [cover, author],
  })
  return message
}
