import * as console from 'console'
import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageReaction,
  SlashCommandBuilder,
  TextChannel,
  User,
} from 'discord.js'
import { FullMarket } from 'manifold-sdk'
import {
  messagesHandledViaInteraction,
  registerHelpMessage,
} from '../common.js'
import { bettingEmojis, customEmojis, emojis, getEmoji } from '../emojis.js'
import {
  currentProbText,
  getMarketFromSlug,
  getSlug,
  handleBet,
  sendThreadMessage,
} from '../helpers.js'

export const data = new SlashCommandBuilder()
  .setName('market')
  .setDescription('Link to a market that other users can bet on with reactions')
  .addStringOption((option) =>
    option.setName('link').setDescription('The link to the market to bet on')
  )

export async function execute(interaction: ChatInputCommandInteraction) {
  const link = interaction.options.getString('link')
  if (!link) {
    await interaction.reply('You must specify a market link')
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
    const { name } = reaction.emoji
    console.log(`Collected ${name} from user id: ${user.id}`)

    // Market description
    if (name === 'ℹ️') {
      const content = `Market details: ${market.textDescription}`
      await sendThreadMessage(channel, market, content, user)
      return
    }

    // Help
    if (name === '❓') {
      const content = `This is a market for the question: ${market.question}. You can bet on the outcome of the market by reacting to my previous message with the bet you want to make. ${registerHelpMessage}`
      await sendThreadMessage(channel, market, content, user)
      return
    }
    const message = reaction.message.partial
      ? await reaction.message.fetch()
      : reaction.message

    // Attempt to place a bet
    await handleBet(reaction, user, channel, message, market)
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
    const emojiText = ` ${getEmoji(interaction.guild, emoji)}  `
    bettingEmojis[emoji].outcome === 'YES'
      ? (yesBetsEmojis += emojiText)
      : (noBetsEmojis += emojiText)
  }

  const previousEmbed = message.embeds[0]
  const marketEmbed = EmbedBuilder.from(previousEmbed)
  marketEmbed
    .setColor(0x0099ff)
    .setTitle(market.question)
    .setURL(market.url)
    .setDescription(currentProbText(market.probability))
    .setThumbnail('https://manifold.markets/logo-cover.png')
    .addFields(
      {
        name: 'Bet YES',
        value: `${yesBetsEmojis} Mana`,
        inline: true,
      },
      {
        name: 'Bet NO',
        value: `${noBetsEmojis} Mana`,
        inline: true,
      }
    )
    // .setImage('https://i.imgur.com/AfFp7pu.png')
    .setTimestamp(market.closeTime)
    .setFooter({
      text: `A market by ${market.creatorName}`,
      iconURL: market.creatorAvatarUrl,
    })

  message = await message.edit({
    embeds: [marketEmbed],
  })
  return message
}
