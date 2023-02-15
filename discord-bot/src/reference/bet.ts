import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js'
import { channelMarkets, getAPIInstance, getMarketByTitle } from '../common.js'

export const data = new SlashCommandBuilder()
  .setName('bet')
  .setDescription('Bets in a market')
  .addIntegerOption((option) =>
    option
      .setName('amount')
      .setDescription('the amount to bet in M$')
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName('marketid')
      .setDescription(
        'the ID of the market to bet in (use /market to get this)'
      )
  )
  .addStringOption((option) =>
    option
      .setName('name')
      .setDescription(
        'the name of the market to bet in (use /market to get this)'
      )
  )
  .addStringOption((option) =>
    option
      .setName('outcome')
      .setDescription('the outcome to bet on (for binary markets)')
      .addChoices({ name: 'YES', value: 'YES' }, { name: 'NO', value: 'NO' })
  )
  .addStringOption((option) =>
    option
      .setName('choice')
      .setDescription('the choice to bet on (for free-response markets)')
  )

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.reply('Placing bet...')
  const api = await getAPIInstance(interaction.user)
  if (!api) return

  const name = interaction.options.getString('name')
  let id = interaction.options.getString('marketid')
  if (id && name) {
    await interaction.editReply(
      'You cannot specify both a market ID and a market name'
    )
    return
  }

  if (!id && !name && interaction.channel)
    id = channelMarkets[interaction.channel.id]

  let market
  if (name) {
    market = await getMarketByTitle(name, { exact: true })
    if (!market) {
      await interaction.editReply(`No market found with title "${name}" :(`)
      return
    }
  } else if (id) {
    market = await api.getMarket({ id })
  } else {
    await interaction.editReply(
      'You must specify a valid market ID (from /market) or market name'
    )
    return
  }

  let outcome
  if (market.outcomeType === 'BINARY') {
    outcome = interaction.options.getString('outcome')
  } else if (market.outcomeType === 'FREE_RESPONSE') {
    const choice = interaction.options.getString('choice')!
    outcome = market.answers?.find(
      (a) => a.text.toLowerCase().trim() === choice.toLowerCase().trim()
    )?.id
    if (outcome === undefined) {
      await interaction.editReply(
        `Couldn't find a choice with text "${choice}"`
      )
      return
    }
  } else {
    await interaction.editReply(
      market.outcomeType + ' markets are not supported'
    )
    return
  }
  if (!outcome) {
    await interaction.editReply(
      'You must specify something to bet on using the `outcome` or `choice` options depending on the market type'
    )
    return
  }
  const amount = interaction.options.getInteger('amount')!

  try {
    await api.createBet({
      amount,
      marketId: id ?? '',
      outcome,
    })
    await interaction.editReply(
      `Bet M$${amount} on ${outcome} in "${market.question}"!`
    )
  } catch (e) {
    await interaction.editReply(`Error: ${e}`)
  }
}
