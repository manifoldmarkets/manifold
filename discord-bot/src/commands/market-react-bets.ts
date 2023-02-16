import * as console from 'console'
import {
  ChatInputCommandInteraction,
  MessageReaction,
  SlashCommandBuilder,
  TextChannel,
  User,
} from 'discord.js'
import {
  messagesHandledViaInteraction,
  registerHelpMessage,
} from '../common.js'
import { bettingEmojis, customEmojis, emojis, getEmoji } from '../emojis.js'
import {
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

  const message = await sendMarketIntro(interaction, link)

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
      await sendThreadMessage(channel, slug, content, user)
      return
    }

    // Help
    if (name === '❓') {
      const content = `This is a market for the question: ${market.question}. You can bet on the outcome of the market by reacting to my previous message with the bet you want to make. ${registerHelpMessage}`
      await sendThreadMessage(channel, slug, content, user)
      return
    }

    // Attempt to place a bet
    await handleBet(reaction, user, channel, message, market)
  })

  collector.on('remove', async (reaction, user) => {
    console.log(`${user.id} removed the reaction ${reaction.emoji.name}`)
    await handleBet(reaction, user, channel, message, market, true)
  })
}

const sendMarketIntro = async (
  interaction: ChatInputCommandInteraction,
  link: string
) => {
  let message = await interaction.reply({
    content: 'Loading market...',
    fetchReply: true,
  })
  messagesHandledViaInteraction.add(message.id)

  for (const emoji of emojis) {
    if (customEmojis.includes(emoji)) {
      // TODO: this only works on my guild rn
      const reactionEmoji = interaction.guild?.emojis.cache.find(
        (e) => e.id === emoji
      )
      if (reactionEmoji) await message.react(reactionEmoji)
    } else await message.react(emoji)
  }

  let content = `React to this message to bet in the market: ${link}\n\n`
  let yesBets = 'To bet YES:'
  let noBets = 'To bet NO:'
  for (const emoji in bettingEmojis) {
    const { outcome, amount } = bettingEmojis[emoji]
    if (outcome === 'YES')
      yesBets += `   M${amount}:  ${getEmoji(interaction.guild, emoji)}   or`
    else noBets += `   M${amount}:  ${getEmoji(interaction.guild, emoji)}   or`
  }
  content += yesBets.slice(0, -3) + '\n\n' + noBets.slice(0, -3) + '\n'
  // for (const emoji in otherEmojis) {
  //   const text = otherEmojis[emoji]
  //   content += `${emoji} - ${text}\n`
  // }
  message = await interaction.editReply({
    content,
  })
  return message
}
