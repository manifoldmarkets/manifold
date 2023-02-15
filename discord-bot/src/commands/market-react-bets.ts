import * as console from 'console'
import {
  ChatInputCommandInteraction,
  MessageReaction,
  SlashCommandBuilder,
  TextChannel,
  ThreadChannel,
  User,
} from 'discord.js'
import { FullMarket } from 'manifold-sdk'
import { getAPIInstance, registerHelpMessage } from '../common.js'
import {
  bettingEmojis,
  customEmojis,
  emojis,
  getEmoji,
  otherEmojis,
} from '../emojis.js'

export const data = new SlashCommandBuilder()
  .setName('market')
  .setDescription('Link to a market that other users can bet on with reactions')
  .addStringOption((option) =>
    option.setName('link').setDescription('The link to the market to bet on')
  )

const channels: { [key: string]: ThreadChannel } = {}

export async function execute(interaction: ChatInputCommandInteraction) {
  const link = interaction.options.getString('link')
  if (!link) {
    await interaction.reply('You must specify a market link')
    return
  }

  const market = await getMarketFromLink(interaction, link)
  if (!market) return

  const message = await sendMarketIntro(interaction, link)

  const filter = (reaction: MessageReaction, user: User) => {
    if (user.id === message.author.id) return false
    return !!reaction.emoji
  }

  const collector = message.createReactionCollector({ filter, dispose: true })

  collector.on('collect', async (reaction, user) => {
    const { name } = reaction.emoji
    console.log(`Collected ${name} from user id: ${user.id}`)

    // Market description
    if (name === 'ℹ️') {
      const content = `Market details: ${market.textDescription}`
      await sendThreadMessage(
        interaction.channel as TextChannel,
        market,
        content,
        user
      )
      return
    }

    // Help
    if (name === '❓') {
      const content = `This is a market for the question: ${market.question}. You can bet on the outcome of the market by reacting to my previous message with the bet you want to make. ${registerHelpMessage}`
      await sendThreadMessage(
        interaction.channel as TextChannel,
        market,
        content,
        user
      )
      return
    }

    // Attempt to place a bet
    await handleBet(reaction, user)
  })

  collector.on('remove', async (reaction, user) => {
    console.log(`${user.id} removed the reaction ${reaction.emoji.name}`)
    await handleBet(reaction, user, true)
  })

  const handleBet = async (
    reaction: MessageReaction,
    user: User,
    sale?: boolean
  ) => {
    const emojiKey = customEmojis.includes(reaction.emoji.id ?? '_')
      ? reaction.emoji.id
      : reaction.emoji.name
    if (!emojiKey || !Object.keys(bettingEmojis).includes(emojiKey)) return

    const { amount, outcome: buyOutcome } = bettingEmojis[emojiKey]
    try {
      const api = await getAPIInstance(user, !sale)
      if (!api) {
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
      await api.createBet({
        amount,
        marketId: market.id,
        outcome,
      })
      const content = `${user.tag} ${
        sale ? 'sold' : 'bet'
      } M$${amount} on ${buyOutcome} in "${market.question}"!`
      await sendThreadMessage(
        interaction.channel as TextChannel,
        market,
        content,
        user
      )
    } catch (e) {
      const content = `Error: ${e}`
      await sendThreadMessage(
        interaction.channel as TextChannel,
        market,
        content,
        user
      )
    }
  }
}

const getThread = async (channel: TextChannel, market: FullMarket) => {
  const slug = market.url.split('/').pop()
  const name = `market-bot-bets-${slug}`
  if (channels[name]) return channels[name]
  let thread = channel.threads.cache.find((x) => x.name === name)
  if (thread) return thread
  thread = await channel.threads.create({
    name,
    autoArchiveDuration: 60,
    reason: 'Bet status for market' + market.question,
  })
  channels[name] = thread
  return thread
}

const sendThreadMessage = async (
  channel: TextChannel,
  market: FullMarket,
  content: string,
  user: User
) => {
  const thread = await getThread(channel, market)
  await Promise.all([thread.members.add(user), thread.send(content)])
}

const sendMarketIntro = async (
  interaction: ChatInputCommandInteraction,
  link: string
) => {
  let content = `React to this message to bet in the market: ${link}\n`
  let yesBets = 'To bet YES:'
  let noBets = 'To bet NO:'
  for (const emoji in bettingEmojis) {
    const { outcome, amount } = bettingEmojis[emoji]
    if (outcome === 'YES')
      yesBets += `   M${amount}:  ${getEmoji(interaction.guild, emoji)}   or`
    else noBets += `   M${amount}:  ${getEmoji(interaction.guild, emoji)}   or`
  }
  content += yesBets.slice(0, -3) + '\n' + noBets.slice(0, -3) + '\n'
  for (const emoji in otherEmojis) {
    const text = otherEmojis[emoji]
    content += `${emoji} - ${text}\n`
  }
  const message = await interaction.reply({
    content,
    fetchReply: true,
  })

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

const getMarketFromLink = async (
  interaction: ChatInputCommandInteraction,
  link: string
) => {
  // get the last part of the link, which is the slug, filtering out qeuries and #
  const slug = link.split('/').pop()?.split('?')[0].split('#')[0]
  console.log('found market with slug:', slug)
  if (!slug) {
    await interaction.reply(
      'Invalid market link, could not find slug from link'
    )
    return
  }

  const market: FullMarket = await fetch(
    `https://manifold.markets/api/v0/slug/${slug}`
  ).then((res) => res.json())

  if (!market) {
    await interaction.reply('Market not found with slug: ' + slug)
    return
  }
  return market
}
